import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docker/rootfs/usr/local/bin/docker-entrypoint.sh",
)

// Mirrors the real dist/ layout: one worker*.mjs per tsdown entry, plus a
// `foo` worker that exists in no hardcoded list — proving auto-discovery.
const STANDARD_WORKERS = [
  "chat",
  "events",
  "integration",
  "ai-agent",
  "heavy",
  "default",
  "trigger",
  "webhook",
  "schedule",
  "sequence-scheduler",
  "foo",
]

let distDir: string

function touch(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, "")
}

function run(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("sh", [SCRIPT, ...args], {
      // /bin/echo stub avoids launching node: a resolved `worker <name>` exec
      // simply echoes the script path instead of running it.
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        WORKER_DIST_DIR: distDir,
        NODE_BIN: "/bin/echo",
        ...env,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { stdout, status: 0 }
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string }
    return {
      stdout: `${err.stdout ?? ""}${err.stderr ?? ""}`,
      status: err.status ?? 1,
    }
  }
}

beforeEach(() => {
  distDir = mkdtempSync(join(tmpdir(), "worker-dist-"))
  for (const w of STANDARD_WORKERS) {
    touch(join(distDir, w, "worker.mjs"))
  }
  touch(join(distDir, "sequence-scheduler", "worker-producer.mjs"))
  touch(join(distDir, "sequence-scheduler", "worker-consumer.mjs"))
  touch(join(distDir, "core.mjs"))
  touch(join(distDir, "standalone.mjs"))
})

afterEach(() => {
  rmSync(distDir, { recursive: true, force: true })
})

describe("docker-entrypoint worker discovery", () => {
  test("resolves a standard worker to its dist bundle", () => {
    const { stdout, status } = run(["worker", "chat"])
    expect(status).toBe(0)
    expect(stdout.trim()).toBe(join(distDir, "chat", "worker.mjs"))
  })

  test("aliases sequence variants to their historical CLI names", () => {
    expect(run(["worker", "sequence-producer"]).stdout.trim()).toBe(
      join(distDir, "sequence-scheduler", "worker-producer.mjs"),
    )
    expect(run(["worker", "sequence-consumer"]).stdout.trim()).toBe(
      join(distDir, "sequence-scheduler", "worker-consumer.mjs"),
    )
  })

  test("auto-discovers a new worker with no script edit", () => {
    const { stdout, status } = run(["worker", "foo"])
    expect(status).toBe(0)
    expect(stdout.trim()).toBe(join(distDir, "foo", "worker.mjs"))
  })

  test("rejects a worker that was not built (e.g. removed analytics)", () => {
    const { stdout, status } = run(["worker", "analytics"])
    expect(status).toBe(3)
    expect(stdout).toContain("Usage:")
  })

  test("usage lists discovered workers including events and sequence variants", () => {
    const { stdout } = run(["worker", "badname"])
    expect(stdout).toContain("events")
    expect(stdout).toContain("sequence-producer")
    expect(stdout).toContain("sequence-consumer")
    // The stale analytics worker must never appear.
    expect(stdout).not.toContain("analytics")
  })

  test("errors when no worker bundles are present", () => {
    rmSync(distDir, { recursive: true, force: true })
    mkdirSync(distDir, { recursive: true })
    const { stdout, status } = run(["worker", "all"])
    expect(status).toBe(4)
    expect(stdout).toContain("No worker bundles found")
  })

  test("core runs the single-process bundle, outside the `all` roster", () => {
    const { stdout, status } = run(["worker", "core"])
    expect(status).toBe(0)
    expect(stdout.trim()).toBe(join(distDir, "core.mjs"))
    // core.mjs is not a `<dir>/worker*.mjs` bundle, so `all` never starts it
    // alongside the per-queue processes it already contains.
    const usage = run(["worker", "badname"]).stdout.split("\n")[0]
    expect(usage.match(/\bcore\b/g)).toHaveLength(1)
  })

  test("core fails loudly when its bundle was not built", () => {
    rmSync(join(distDir, "core.mjs"))
    const { stdout, status } = run(["worker", "core"])
    expect(status).toBe(4)
    expect(stdout).toContain("Worker script not found")
  })

  test("standalone runs the core + schedule bundle, outside the `all` roster", () => {
    const { stdout, status } = run(["worker", "standalone"])
    expect(status).toBe(0)
    expect(stdout.trim()).toBe(join(distDir, "standalone.mjs"))
    const usage = run(["worker", "badname"]).stdout.split("\n")[0]
    expect(usage.match(/\bstandalone\b/g)).toHaveLength(1)
  })

  test("standalone fails loudly when its bundle was not built", () => {
    rmSync(join(distDir, "standalone.mjs"))
    const { stdout, status } = run(["worker", "standalone"])
    expect(status).toBe(4)
    expect(stdout).toContain("Worker script not found")
  })
})

describe("standalone bundle", () => {
  const src = (file: string) =>
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src", file),
      "utf8",
    )

  test("includes schedule on top of core; core stays cron-free for pnpm dev", () => {
    const standalone = src("standalone.ts")
    expect(standalone).toContain('import "./core"')
    expect(standalone).toContain('import "./schedule/worker"')
    const coreImports = src("core.ts")
      .split("\n")
      .filter((line) => line.startsWith("import "))
    expect(coreImports.some((line) => line.includes("schedule"))).toBe(false)
  })
})
