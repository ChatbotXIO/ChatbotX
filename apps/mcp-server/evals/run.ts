import { createHash } from "node:crypto"
import {
  cp,
  lstat,
  mkdir,
  readdir,
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
import { materializeMultilingualCases } from "./cases-multilingual"
import {
  type EpisodeGrading,
  firstSearchRank,
  gradeEpisode,
  type ModelToolCall,
} from "./grade"
import { createSandbox, type HttpTrace } from "./sandbox"

type ExposurePlan = ExposureMode | "both"
type CorpusName = "business" | "multilingual"

type RunOptions = {
  mode: "run"
  spec: string
  out: string
  phase: "baseline" | "candidate" | "smoke"
  models: string[]
  seed: number
  exposure: ExposurePlan
  corpus: CorpusName
  caseIds?: string[]
  serverSource?: string
}

type CompareOptions = {
  mode: "compare"
  baseline: string
  candidate: string
}

type CliOptions = RunOptions | CompareOptions

type ParsedRunOptions = Omit<
  RunOptions,
  "caseIds" | "mode" | "out" | "phase" | "serverSource" | "spec"
> &
  Partial<
    Pick<RunOptions, "caseIds" | "out" | "phase" | "serverSource" | "spec">
  >

type McpTool = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

type Episode = {
  callToolErrorCount: number
  case: EvalCase
  elapsedMs: number
  exposure: ExposureMode
  final: string
  grading: EpisodeGrading
  http: HttpTrace[]
  instructionsHash: string | null
  model: string
  modelTools: ModelToolCall[]
  providerError?: string
  searchRank: number | null
  unknownToolCount: number
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
  "Usage:\n  pnpm --filter chatbotx-mcp eval:business --spec <absolute-json-path> --out <absolute-directory> --phase baseline|candidate|smoke --seed 20260923 --models gpt-4o-mini,gpt-4.1-mini [--cases family-a,family-b] [--server-source <absolute-directory>] [--exposure default|meta-only|both] [--corpus business|multilingual]\n  pnpm --filter chatbotx-mcp eval:business --compare <baseline-directory> <candidate-directory>"

const parseArgs = (args: string[]): CliOptions => {
  let compare: CompareOptions | undefined
  const options: ParsedRunOptions = {
    corpus: "business",
    exposure: "both",
    models: [],
    seed: EVAL_SEED,
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--compare") {
      const baseline = args[index + 1]
      const candidate = args[index + 2]
      if (!(baseline && candidate)) {
        throw new Error(`${usage}\n--compare needs two directories.`)
      }
      compare = { baseline, candidate, mode: "compare" }
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
    } else if (argument === "--exposure") {
      if (value !== "default" && value !== "meta-only" && value !== "both") {
        throw new Error(`${usage}\nInvalid --exposure ${value}.`)
      }
      options.exposure = value
    } else if (argument === "--corpus") {
      if (value !== "business" && value !== "multilingual") {
        throw new Error(`${usage}\nInvalid --corpus ${value}.`)
      }
      options.corpus = value
    } else {
      throw new Error(`${usage}\nUnknown flag ${argument}.`)
    }
    index += 1
  }
  if (compare) {
    return compare
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
  if (options.models.length === 0) {
    throw new Error(`${usage}\nAt least one model is required.`)
  }
  return {
    caseIds: options.caseIds,
    corpus: options.corpus,
    exposure: options.exposure,
    mode: "run",
    models: options.models,
    out: options.out,
    phase: options.phase,
    seed: options.seed,
    serverSource: options.serverSource,
    spec: options.spec,
  }
}

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex")

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
  const sourceRoot = join(source, "src")
  await cp(sourceRoot, join(target, "src"), { recursive: true })
  await cp(join(source, "package.json"), join(target, "package.json"))
  await symlink(join(source, "node_modules"), join(target, "node_modules"))
  const sourceFiles = (
    await readdir(sourceRoot, { recursive: true, withFileTypes: true })
  )
    .filter((entry) => entry.isFile())
    .sort(
      (left, right) =>
        left.parentPath.localeCompare(right.parentPath) ||
        left.name.localeCompare(right.name),
    )
  const sourceText = (
    await Promise.all([
      readFile(join(source, "package.json"), "utf8"),
      ...sourceFiles.map((entry) =>
        readFile(join(entry.parentPath, entry.name), "utf8"),
      ),
    ])
  ).join("\n")
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

const safeClose = async (close?: () => Promise<void>): Promise<void> => {
  if (!close) {
    return
  }
  try {
    await close()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Evaluation cleanup failed: ${message}\n`)
  }
}

const MAX_TOOL_CALLS_PER_EPISODE = 20

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
          if (traces.length >= MAX_TOOL_CALLS_PER_EPISODE) {
            const result = "Evaluation tool-call limit reached."
            traces.push({
              arguments: arguments_ as Record<string, unknown>,
              isError: true,
              name: mcpTool.name,
              result,
            })
            return result
          }
          const argumentsObject = arguments_ as Record<string, unknown>
          const trace: ModelToolCall = {
            arguments: argumentsObject,
            name: mcpTool.name,
          }
          traces.push(trace)
          const rawResult = await client.callTool({
            name: mcpTool.name,
            arguments: argumentsObject,
          })
          trace.isError = rawResult.isError === true
          trace.result = decodeMcp(rawResult)
          return trace.result
        },
      }),
    ]),
  )
}

const callToolErrorCount = (calls: ModelToolCall[]): number =>
  calls.filter((call) => call.name === "call_tool" && call.isError === true)
    .length

const unknownToolCount = (calls: ModelToolCall[]): number =>
  calls.filter(
    (call) =>
      call.name === "call_tool" &&
      call.isError === true &&
      typeof call.result === "string" &&
      call.result.startsWith("Unknown tool"),
  ).length

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
  let instructionsHash: string | null = null
  try {
    clientHandle = await startMcpClient(props.serverSource, sandbox.baseUrl)
    const instructions = clientHandle.client.getInstructions() ?? ""
    instructionsHash = sha256(instructions)
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
    await safeClose(clientHandle?.close)
    await safeClose(sandbox.close)
  }
  return {
    callToolErrorCount: callToolErrorCount(calls),
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
    instructionsHash,
    modelTools: calls,
    providerError,
    searchRank: firstSearchRank(calls, props.evalCase.expectedTools),
    unknownToolCount: unknownToolCount(calls),
    usage,
  }
}

const average = (values: number[]): number | null =>
  values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length

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
      const searchRanks = rows
        .map((episode) => episode.searchRank)
        .filter((rank): rank is number => rank !== null)
      return [
        key,
        {
          total: rows.length,
          pass,
          fail: rows.length - pass - infrastructure,
          infrastructure,
          successRate: rows.length === 0 ? 0 : pass / rows.length,
          averageSearchRank: average(searchRanks),
          searchRankSamples: searchRanks.length,
          totalCallToolErrors: rows.reduce(
            (total, episode) => total + episode.callToolErrorCount,
            0,
          ),
          totalUnknownToolCalls: rows.reduce(
            (total, episode) => total + episode.unknownToolCount,
            0,
          ),
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
  const comparison = candidateRows.map((row) => {
    const baselineRow = baselineByKey.get(key(row))
    return {
      key: key(row),
      baseline: baselineRow?.grading.status ?? "missing",
      candidate: row.grading.status,
      baselineSearchRank: baselineRow?.searchRank ?? null,
      candidateSearchRank: row.searchRank,
    }
  })
  const regressions = comparison.filter(
    (row) => row.baseline === "pass" && row.candidate !== "pass",
  )
  const baselineRanks = baselineRows
    .map((row) => row.searchRank)
    .filter((rank): rank is number => rank !== null)
  const candidateRanks = candidateRows
    .map((row) => row.searchRank)
    .filter((rank): rank is number => rank !== null)
  const baselineCallToolErrors = baselineRows.reduce(
    (total, row) => total + row.callToolErrorCount,
    0,
  )
  const candidateCallToolErrors = candidateRows.reduce(
    (total, row) => total + row.callToolErrorCount,
    0,
  )
  process.stdout.write(
    `${JSON.stringify(
      {
        baseline: basename(baselineDirectory),
        candidate: basename(candidateDirectory),
        regressions,
        compared: comparison.length,
        averageSearchRank: {
          baseline: average(baselineRanks),
          candidate: average(candidateRanks),
        },
        totalCallToolErrors: {
          baseline: baselineCallToolErrors,
          candidate: candidateCallToolErrors,
        },
      },
      null,
      2,
    )}\n`,
  )
  if (regressions.length > 0) {
    process.exitCode = 1
  }
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  if (options.mode === "compare") {
    return await runComparison(options.baseline, options.candidate)
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required for model evaluation; no results were simulated.",
    )
  }
  const specText = await readFile(options.spec, "utf8")
  const originalSpec = JSON.parse(specText) as Record<string, unknown>
  const cases =
    options.corpus === "multilingual"
      ? materializeMultilingualCases()
      : materializeCases()
  const selected = options.caseIds
    ? cases.filter((evalCase) => options.caseIds?.includes(evalCase.family))
    : cases
  if (selected.length === 0) {
    throw new Error("No operations selected by --cases.")
  }
  await ensureFreshOutput(options.out)
  const snapshot = await snapshotServer(options.out, options.serverSource)
  const runtimeSpec = {
    ...originalSpec,
    servers: [{ url: "http://127.0.0.1/api" }],
  }
  const manifest: Manifest = {
    corpusHash: corpusHash(cases),
    generatedAt: new Date().toISOString(),
    instructionsHash: "pending",
    modelIds: options.models,
    phase: options.phase,
    seed: options.seed,
    sourceHash: snapshot.sourceHash,
    specHash: sha256(specText),
    runtimeSpecHash: sha256(JSON.stringify(runtimeSpec)),
  }
  await writeJson(join(options.out, "cases.json"), selected)
  const exposures: ExposureMode[] =
    options.exposure === "both" ? ["default", "meta-only"] : [options.exposure]
  const episodes: Episode[] = []
  for (const modelId of options.models) {
    for (const exposure of exposures) {
      for (const evalCase of selected) {
        episodes.push(
          await evaluateCase({
            evalCase,
            modelId,
            serverSource: snapshot.source,
            spec: runtimeSpec,
            exposure,
          }),
        )
      }
    }
    // `safetyCases` targets `cases.ts`'s "vi" locale specifically; the
    // multilingual probe corpus (`cases-multilingual.ts`) has no such
    // locale and exists purely for the per-locale search/tool-selection
    // comparison, not the repeated-safety-case check.
    const safety =
      options.corpus === "multilingual" ? [] : safetyCases(selected)
    for (const evalCase of safety) {
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
      .filter((hash): hash is string => hash !== null)
      .sort()
      .join(","),
  )
  await writeJson(join(options.out, "manifest.json"), manifest)
  await writeFile(
    join(options.out, "episodes.jsonl"),
    `${episodes.map((episode) => JSON.stringify(episode)).join("\n")}\n`,
    "utf8",
  )
  await writeJson(join(options.out, "summary.json"), summary(episodes))
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
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
