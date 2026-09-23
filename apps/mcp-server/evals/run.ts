import { createHash } from "node:crypto"
import {
  cp,
  lstat,
  mkdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises"
import { basename, isAbsolute, join, resolve } from "node:path"
import { createOpenAI } from "@ai-sdk/openai"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { generateText, jsonSchema, stepCountIs, type ToolSet, tool } from "ai"
import {
  corpusHash,
  EVAL_SEED,
  type EvalCase,
  type ExposureMode,
  materializeCases,
  safetyCases,
} from "./cases"
import { createSandbox, type HttpTrace } from "./sandbox"

type CliOptions = {
  caseIds?: string[]
  compare?: [string, string]
  models: string[]
  out?: string
  phase?: "baseline" | "candidate" | "smoke"
  seed: number
  serverSource?: string
  spec?: string
}

type McpTool = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

type ModelToolCall = {
  arguments: Record<string, unknown>
  name: string
}

type Episode = {
  case: EvalCase
  elapsedMs: number
  exposure: ExposureMode
  final: string
  grading: { reasons: string[]; status: "pass" | "fail" | "infrastructure" }
  http: HttpTrace[]
  instructionsHash: string
  model: string
  modelTools: ModelToolCall[]
  providerError?: string
  usage?: unknown
}

type Manifest = {
  corpusHash: string
  generatedAt: string
  instructionsHash: string
  modelIds: string[]
  phase: string
  seed: number
  sourceHash: string
  specHash: string
  runtimeSpecHash: string
}

const usage =
  "Usage:\n  pnpm --filter chatbotx-mcp eval:business --spec <absolute-json-path> --out <absolute-directory> --phase baseline|candidate|smoke --seed 20260923 --models gpt-4o-mini,gpt-4.1-mini [--cases family-a,family-b] [--server-source <absolute-directory>]\n  pnpm --filter chatbotx-mcp eval:business --compare <baseline-directory> <candidate-directory>"

const finalSuccessPattern = /(?:done|sent|created|booked|cancelled|success)/i

const parseArgs = (args: string[]): CliOptions => {
  const options: Partial<CliOptions> = { models: [], seed: EVAL_SEED }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--compare") {
      const baseline = args[index + 1]
      const candidate = args[index + 2]
      if (!(baseline && candidate)) {
        throw new Error(`${usage}\n--compare needs two directories.`)
      }
      options.compare = [baseline, candidate]
      index += 2
      continue
    }
    const value = args[index + 1]
    if (!value) {
      throw new Error(`${usage}\nMissing value for ${argument}.`)
    }
    if (argument === "--spec") {
      options.spec = value
    } else if (argument === "--out") {
      options.out = value
    } else if (argument === "--phase") {
      if (value !== "baseline" && value !== "candidate" && value !== "smoke") {
        throw new Error(`${usage}\nInvalid --phase ${value}.`)
      }
      options.phase = value
    } else if (argument === "--seed") {
      const seed = Number(value)
      if (!Number.isSafeInteger(seed)) {
        throw new Error(`${usage}\n--seed must be an integer.`)
      }
      options.seed = seed
    } else if (argument === "--models") {
      options.models = value.split(",").filter(Boolean)
    } else if (argument === "--cases") {
      options.caseIds = value.split(",").filter(Boolean)
    } else if (argument === "--server-source") {
      options.serverSource = value
    } else {
      throw new Error(`${usage}\nUnknown flag ${argument}.`)
    }
    index += 1
  }
  if (options.compare) {
    return {
      compare: options.compare,
      models: [],
      seed: options.seed ?? EVAL_SEED,
    }
  }
  if (!(options.spec && options.out && options.phase)) {
    throw new Error(`${usage}\n--spec, --out, and --phase are required.`)
  }
  if (!(isAbsolute(options.spec) && isAbsolute(options.out))) {
    throw new Error("--spec and --out must be absolute paths.")
  }
  if (options.serverSource && !isAbsolute(options.serverSource)) {
    throw new Error("--server-source must be an absolute path.")
  }
  if (!options.models || options.models.length === 0) {
    throw new Error(`${usage}\nAt least one model is required.`)
  }
  return options as CliOptions
}

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex")
const executableName = (operationId: string): string =>
  operationId
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[.\-\s]+/g, "_")
    .toLowerCase()
const flatten = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value)

const ensureFreshOutput = async (directory: string): Promise<void> => {
  try {
    await lstat(directory)
    throw new Error(
      `Refusing to overwrite existing evaluation output: ${directory}`,
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error
    }
  }
  await mkdir(directory, { recursive: true })
}

const snapshotServer = async (
  out: string,
  sourceOverride?: string,
): Promise<{ source: string; sourceHash: string }> => {
  const source = sourceOverride ?? resolve("apps/mcp-server")
  const target = join(out, "server-source")
  await mkdir(target, { recursive: true })
  await cp(join(source, "src"), join(target, "src"), { recursive: true })
  await cp(join(source, "package.json"), join(target, "package.json"))
  await symlink(join(source, "node_modules"), join(target, "node_modules"))
  const sourceText = await readFile(join(source, "package.json"), "utf8")
  return { source: target, sourceHash: sha256(sourceText) }
}

const decodeMcp = (result: unknown): unknown => {
  if (
    !result ||
    typeof result !== "object" ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    return result
  }

  const text = result.content
    .flatMap((item) => {
      if (
        item &&
        typeof item === "object" &&
        "text" in item &&
        typeof item.text === "string"
      ) {
        return [item.text]
      }
      return []
    })
    .join("\n")
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

type McpClientHandle = {
  client: Client
  close: () => Promise<void>
}

const startMcpClient = async (
  serverSource: string,
  apiUrl: string,
): Promise<McpClientHandle> => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    cwd: serverSource,
    env: {
      CHATBOTX_API_KEY: "synthetic-evaluation-token",
      CHATBOTX_API_URL: apiUrl,
      CHATBOTX_MCP_TRANSPORT: "stdio",
      DOTENV_CONFIG_PATH: "/dev/null",
    },
    stderr: "pipe",
  })
  const client = new Client({ name: "mcp-business-eval", version: "1.0.0" })
  await client.connect(transport)
  return {
    client,
    close: async () => {
      await client.close()
    },
  }
}

const buildTools = (
  mcpTools: McpTool[],
  client: Client,
  traces: ModelToolCall[],
  exposure: ExposureMode,
): ToolSet => {
  const exposed =
    exposure === "meta-only"
      ? mcpTools.filter(
          (item) => item.name === "search_tools" || item.name === "call_tool",
        )
      : mcpTools

  return Object.fromEntries(
    exposed.map((mcpTool) => [
      mcpTool.name,
      tool({
        description: mcpTool.description ?? "",
        inputSchema: jsonSchema(
          mcpTool.inputSchema ?? { type: "object", properties: {} },
        ),
        execute: async (arguments_) => {
          if (traces.length >= 20) {
            return { error: "Evaluation tool-call limit reached." }
          }
          const argumentsObject = arguments_ as Record<string, unknown>
          traces.push({ name: mcpTool.name, arguments: argumentsObject })
          const result = await client.callTool({
            name: mcpTool.name,
            arguments: argumentsObject,
          })
          return decodeMcp(result)
        },
      }),
    ]),
  )
}

const hasArgument = (
  calls: ModelToolCall[],
  predicate: EvalCase["argumentPredicates"][number],
): boolean =>
  calls.some((call) => {
    const value = call.arguments[predicate.key]
    if (value === undefined) {
      return false
    }
    const text = flatten(value)
    if (predicate.value !== undefined && value !== predicate.value) {
      return false
    }
    return predicate.includes === undefined || text.includes(predicate.includes)
  })

const invokedToolNames = (
  calls: ModelToolCall[],
  http: HttpTrace[],
): string[] => [
  ...calls.map((call) =>
    call.name === "call_tool" && typeof call.arguments.name === "string"
      ? call.arguments.name
      : call.name,
  ),
  ...http.flatMap((trace) =>
    trace.operationId ? [executableName(trace.operationId)] : [],
  ),
]

const gradeEpisode = (
  evalCase: EvalCase,
  calls: ModelToolCall[],
  http: HttpTrace[],
  final: string,
  providerError?: string,
): Episode["grading"] => {
  if (providerError) {
    return { status: "infrastructure", reasons: [providerError] }
  }
  const names = invokedToolNames(calls, http)
  const reasons: string[] = []
  if (
    evalCase.expectedOutcome === "complete" &&
    !evalCase.expectedTools.some((name) => names.includes(name))
  ) {
    reasons.push(
      `Expected one of ${evalCase.expectedTools.join(", ")}; received ${names.join(", ") || "none"}.`,
    )
  }
  if (
    evalCase.expectedOutcome === "clarify" &&
    evalCase.forbiddenTools.some((name) => names.includes(name))
  ) {
    reasons.push("Mutated despite required clarification.")
  }
  if (evalCase.forbiddenTools.some((name) => names.includes(name))) {
    reasons.push(
      `Called forbidden tool: ${evalCase.forbiddenTools.find((name) => names.includes(name))}.`,
    )
  }
  for (const predicate of evalCase.argumentPredicates) {
    if (!hasArgument(calls, predicate)) {
      reasons.push(`Missing required semantic argument ${predicate.key}.`)
    }
  }
  if (
    http.some((trace) => trace.status >= 400) &&
    finalSuccessPattern.test(final)
  ) {
    reasons.push("Claimed completion after an API error.")
  }
  if (evalCase.expectedOutcome === "clarify" && final.trim().length < 8) {
    reasons.push("Did not provide a usable clarification.")
  }
  return { status: reasons.length === 0 ? "pass" : "fail", reasons }
}

const evaluateCase = async (props: {
  evalCase: EvalCase
  modelId: string
  serverSource: string
  spec: Record<string, unknown>
  exposure: ExposureMode
}): Promise<Episode> => {
  const started = performance.now()
  const sandbox = await createSandbox(props.spec)
  const calls: ModelToolCall[] = []
  let clientHandle: McpClientHandle | undefined
  let final = ""
  let providerError: string | undefined
  let usage: unknown
  try {
    clientHandle = await startMcpClient(props.serverSource, sandbox.baseUrl)
    const instructions = clientHandle.client.getInstructions() ?? ""
    const listed = await clientHandle.client.listTools()
    const tools = buildTools(
      listed.tools as McpTool[],
      clientHandle.client,
      calls,
      props.exposure,
    )
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const result = await generateText({
      model: openai(props.modelId),
      system: `${instructions}\nCurrent time: ${props.evalCase.now}. Timezone: ${props.evalCase.timezone}.`,
      prompt: props.evalCase.prompt,
      tools,
      stopWhen: stepCountIs(10),
      abortSignal: AbortSignal.timeout(120_000),
      providerOptions: { openai: { parallelToolCalls: false } },
    })
    final = result.text
    usage = result.usage
  } catch (error) {
    providerError = error instanceof Error ? error.message : String(error)
  } finally {
    await clientHandle?.close()
    await sandbox.close()
  }
  return {
    case: props.evalCase,
    elapsedMs: Math.round(performance.now() - started),
    exposure: props.exposure,
    final,
    grading: gradeEpisode(
      props.evalCase,
      calls,
      sandbox.traces,
      final,
      providerError,
    ),
    http: sandbox.traces,
    model: props.modelId,
    instructionsHash: sha256(
      clientHandle?.client.getInstructions() ?? "instructions-unavailable",
    ),
    modelTools: calls,
    providerError,
    usage,
  }
}

const summary = (episodes: Episode[]) => {
  const grouped = Object.groupBy(
    episodes,
    (episode) =>
      `${episode.model}:${episode.exposure}:${episode.case.split}:${episode.case.domain}`,
  )
  return Object.fromEntries(
    Object.entries(grouped).map(([key, group]) => {
      const rows = group ?? []
      const pass = rows.filter(
        (episode) => episode.grading.status === "pass",
      ).length
      const infrastructure = rows.filter(
        (episode) => episode.grading.status === "infrastructure",
      ).length
      return [
        key,
        {
          total: rows.length,
          pass,
          fail: rows.length - pass - infrastructure,
          infrastructure,
          successRate: rows.length === 0 ? 0 : pass / rows.length,
        },
      ]
    }),
  )
}

const writeJson = async (path: string, value: unknown): Promise<void> =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")

const runComparison = async (
  baselineDirectory: string,
  candidateDirectory: string,
): Promise<void> => {
  const [baseline, candidate] = await Promise.all([
    readFile(join(baselineDirectory, "episodes.jsonl"), "utf8"),
    readFile(join(candidateDirectory, "episodes.jsonl"), "utf8"),
  ])
  const parse = (lines: string) =>
    lines
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Episode)
  const baselineRows = parse(baseline)
  const candidateRows = parse(candidate)
  const key = (row: Episode) => `${row.model}:${row.exposure}:${row.case.id}`
  const baselineByKey = new Map(baselineRows.map((row) => [key(row), row]))
  const comparison = candidateRows.map((row) => ({
    key: key(row),
    baseline: baselineByKey.get(key(row))?.grading.status ?? "missing",
    candidate: row.grading.status,
  }))
  const regressions = comparison.filter(
    (row) => row.baseline === "pass" && row.candidate !== "pass",
  )
  process.stdout.write(
    `${JSON.stringify({ baseline: basename(baselineDirectory), candidate: basename(candidateDirectory), regressions, compared: comparison.length }, null, 2)}\n`,
  )
  if (regressions.length > 0) {
    process.exitCode = 1
  }
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  if (options.compare) {
    return runComparison(...options.compare)
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required for model evaluation; no results were simulated.",
    )
  }
  const specText = await readFile(options.spec as string, "utf8")
  const originalSpec = JSON.parse(specText) as Record<string, unknown>
  const cases = materializeCases()
  const selected = options.caseIds
    ? cases.filter((evalCase) => options.caseIds?.includes(evalCase.family))
    : cases
  if (selected.length === 0) {
    throw new Error("No operations selected by --cases.")
  }
  await ensureFreshOutput(options.out as string)
  const snapshot = await snapshotServer(
    options.out as string,
    options.serverSource,
  )
  const runtimeSpec = {
    ...originalSpec,
    servers: [{ url: "http://127.0.0.1/api" }],
  }
  const manifest: Manifest = {
    corpusHash: corpusHash(cases),
    generatedAt: new Date().toISOString(),
    instructionsHash: "pending",
    modelIds: options.models,
    phase: options.phase as string,
    seed: options.seed,
    sourceHash: snapshot.sourceHash,
    specHash: sha256(specText),
    runtimeSpecHash: sha256(JSON.stringify(runtimeSpec)),
  }
  await writeJson(join(options.out as string, "cases.json"), selected)
  const episodes: Episode[] = []
  for (const modelId of options.models) {
    for (const evalCase of selected) {
      episodes.push(
        await evaluateCase({
          evalCase,
          modelId,
          serverSource: snapshot.source,
          spec: runtimeSpec,
          exposure: "default",
        }),
      )
    }
    const metaCases = selected.filter((evalCase) => evalCase.locale === "vi")
    for (const evalCase of metaCases) {
      episodes.push(
        await evaluateCase({
          evalCase,
          modelId,
          serverSource: snapshot.source,
          spec: runtimeSpec,
          exposure: "meta-only",
        }),
      )
    }
    for (const evalCase of safetyCases(selected)) {
      for (let repeat = 0; repeat < 3; repeat += 1) {
        episodes.push(
          await evaluateCase({
            evalCase,
            modelId,
            serverSource: snapshot.source,
            spec: runtimeSpec,
            exposure: "default",
          }),
        )
      }
    }
  }
  manifest.instructionsHash = sha256(
    episodes
      .map((episode) => episode.instructionsHash)
      .sort()
      .join(","),
  )
  await writeJson(join(options.out as string, "manifest.json"), manifest)
  await writeFile(
    join(options.out as string, "episodes.jsonl"),
    `${episodes.map((episode) => JSON.stringify(episode)).join("\n")}\n`,
    "utf8",
  )
  await writeJson(
    join(options.out as string, "summary.json"),
    summary(episodes),
  )
  const infrastructure = episodes.filter(
    (episode) => episode.grading.status === "infrastructure",
  )
  process.stdout.write(
    `${JSON.stringify({ episodes: episodes.length, infrastructure: infrastructure.length, summary: summary(episodes) }, null, 2)}\n`,
  )
  if (infrastructure.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
})
