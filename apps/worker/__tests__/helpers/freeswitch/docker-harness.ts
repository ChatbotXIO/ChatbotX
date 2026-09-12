// Drives `docker build`/`docker run`/`docker compose` for the container
// integration test via node:child_process directly.
// `testcontainers` and `execa` are NOT dependencies of apps/worker
// (`pnpm ls testcontainers --filter worker` / `pnpm ls execa --filter
// worker` both return nothing — execa appears only transitively in the
// lockfile), so per the task instructions this uses `node:child_process`
// rather than adding either as a new dependency for a test-only harness.
import { spawn } from "node:child_process"

export type CommandResult = {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: { readonly cwd?: string; readonly timeoutMs?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL")
          reject(
            new Error(
              `${command} ${args.join(" ")} timed out after ${options.timeoutMs}ms`,
            ),
          )
        }, options.timeoutMs)
      : undefined

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8")
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer)
      }
      reject(error)
    })
    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer)
      }
      resolve({ stdout, stderr, exitCode: code ?? -1 })
    })
  })
}

export type FreeswitchContainerHandle = {
  readonly containerName: string
  readonly eslPort: number
  readonly tlsSipPort: number
  readonly wssPort: number
  stop: () => Promise<void>
}

/**
 * Builds the ChatbotX FreeSWITCH image and runs it with the given
 * environment, publishing ESL/SIP-TLS/WSS on host ports so the test can
 * reach them directly (bypassing docker-compose.yml's fixed local port
 * binds, since the sharding test needs two independently-addressable
 * instances).
 */
export async function startFreeswitchContainer(options: {
  readonly imageTag: string
  readonly containerName: string
  readonly env: Readonly<Record<string, string>>
  readonly eslPort: number
  readonly tlsSipPort: number
  readonly wssPort: number
  readonly signalwireToken: string
}): Promise<FreeswitchContainerHandle> {
  const buildArgs = [
    "build",
    "-t",
    options.imageTag,
    "--build-arg",
    `SIGNALWIRE_TOKEN=${options.signalwireToken}`,
    "docker/freeswitch",
  ]
  const build = await runCommand("docker", buildArgs, {
    timeoutMs: 10 * 60 * 1000,
  })
  if (build.exitCode !== 0) {
    throw new Error(`docker build failed:\n${build.stderr}`)
  }

  const runArgs = [
    "run",
    "-d",
    "--name",
    options.containerName,
    "--rm",
    "-p",
    `${options.eslPort}:8021/tcp`,
    "-p",
    `${options.tlsSipPort}:5061/tcp`,
    "-p",
    `${options.wssPort}:7443/tcp`,
    "--add-host",
    "host.docker.internal:host-gateway",
  ]
  for (const [key, value] of Object.entries(options.env)) {
    runArgs.push("-e", `${key}=${value}`)
  }
  runArgs.push(options.imageTag)

  const run = await runCommand("docker", runArgs, { timeoutMs: 60_000 })
  if (run.exitCode !== 0) {
    throw new Error(`docker run failed:\n${run.stderr}`)
  }

  return {
    containerName: options.containerName,
    eslPort: options.eslPort,
    tlsSipPort: options.tlsSipPort,
    wssPort: options.wssPort,
    stop: async () => {
      await runCommand("docker", ["stop", "-t", "5", options.containerName], {
        timeoutMs: 30_000,
      })
    },
  }
}

/** Polls `docker inspect --format {{.State.Health.Status}}` until healthy
 * or the deadline elapses. */
export async function waitForHealthy(
  containerName: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const result = await runCommand("docker", [
      "inspect",
      "--format",
      "{{.State.Health.Status}}",
      containerName,
    ])
    if (result.stdout.trim() === "healthy") {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${containerName} did not become healthy within ${timeoutMs}ms`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

/** Runs a maintained `sipp` Docker image for one scenario file against a
 * target. `ctaloi/sipp` is the community image the task brief names as a
 * candidate; its tag could not be verified in this environment (`docker
 * manifest inspect` requires registry access the sandbox blocks — see the
 * change report) — pin an exact digest once verified in an environment
 * with registry access, rather than `:latest`. */
export function runSippScenario(options: {
  readonly targetHost: string
  readonly targetPort: number
  readonly scenarioFile: string
  readonly extraArgs?: readonly string[]
  readonly sippImage?: string
}): Promise<CommandResult> {
  const image = options.sippImage ?? "ctaloi/sipp:latest"
  const args = [
    "run",
    "--rm",
    "-v",
    `${options.scenarioFile}:/scenario.xml:ro`,
    "--add-host",
    "host.docker.internal:host-gateway",
    image,
    "-sf",
    "/scenario.xml",
    ...(options.extraArgs ?? []),
    `${options.targetHost}:${options.targetPort}`,
  ]
  return runCommand("docker", args, { timeoutMs: 5 * 60 * 1000 })
}
