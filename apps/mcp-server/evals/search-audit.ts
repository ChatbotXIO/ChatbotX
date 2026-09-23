/**
 * Offline gate for `search_tools` ranking quality -- no LLM, no API key,
 * runs in a few seconds. Loads the real spec (dumped via
 * `MCP_EVAL_SPEC_OUTPUT=<path> pnpm --filter builder test --
 * public-spec-operations.test.ts`, see `apps/builder/__tests__/public-spec-operations.test.ts`),
 * stubs `fetch` to serve it, and scores every eval-corpus prompt through
 * `searchTools()` directly. Exits non-zero when top-1/top-3 rates fall
 * below the given thresholds, so a synonym-table or description change
 * that regresses ranking quality fails fast in CI/dev without needing
 * `eval:business`'s LLM round trips.
 *
 * Usage:
 *   pnpm --filter chatbotx-mcp eval:search --spec <absolute-spec-path> \
 *     [--min-top1 0.65] [--min-top3 0.85] [--verbose]
 */
import { readFile } from "node:fs/promises"
import { isAbsolute } from "node:path"
import { materializeCases } from "./cases"

type CliOptions = {
  minTop1: number
  minTop3: number
  spec: string
  verbose: boolean
}

const usage =
  "Usage:\n  pnpm --filter chatbotx-mcp eval:search --spec <absolute-spec-path> [--min-top1 0.65] [--min-top3 0.85] [--verbose]"

const DEFAULT_MIN_TOP1 = 0.65
const DEFAULT_MIN_TOP3 = 0.85

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    minTop1: DEFAULT_MIN_TOP1,
    minTop3: DEFAULT_MIN_TOP3,
    verbose: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--verbose") {
      options.verbose = true
      continue
    }
    const value = args[index + 1]
    if (!value) {
      throw new Error(`${usage}\nMissing value for ${argument}.`)
    }
    if (argument === "--spec") {
      options.spec = value
    } else if (argument === "--min-top1") {
      options.minTop1 = Number(value)
    } else if (argument === "--min-top3") {
      options.minTop3 = Number(value)
    } else {
      throw new Error(`${usage}\nUnknown flag ${argument}.`)
    }
    index += 1
  }
  if (!options.spec) {
    throw new Error(`${usage}\n--spec is required.`)
  }
  if (!isAbsolute(options.spec)) {
    throw new Error("--spec must be an absolute path.")
  }
  return options as CliOptions
}

type LocaleStats = { n: number; top1: number; top3: number; empty: number }

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  const specText = await readFile(options.spec, "utf8")
  const spec: unknown = JSON.parse(specText)

  // Stub the module-level fetch the loader uses so `loadOpenApiSpec()`
  // parses the real, already-generated spec instead of hitting a live
  // server -- this script never boots the MCP server or a sandbox.
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => spec,
    }) as unknown as Response) as typeof fetch

  const { loadOpenApiSpec } = await import("../src/openapi-loader")
  const { searchTools } = await import("../src/server/meta-tools")
  await loadOpenApiSpec()

  const cases = materializeCases()
  const byLocale = new Map<string, LocaleStats>()
  let top1 = 0
  let top3 = 0
  let empty = 0
  const failures: string[] = []

  for (const evalCase of cases) {
    const results = searchTools(evalCase.prompt, 10).map((tool) => tool.name)
    const rank = results.findIndex((name) =>
      evalCase.expectedTools.includes(name),
    )
    const stats = byLocale.get(evalCase.locale) ?? {
      n: 0,
      top1: 0,
      top3: 0,
      empty: 0,
    }
    stats.n += 1
    if (rank === 0) {
      top1 += 1
      stats.top1 += 1
    }
    if (rank >= 0 && rank < 3) {
      top3 += 1
      stats.top3 += 1
    }
    if (results.length === 0) {
      empty += 1
      stats.empty += 1
    }
    byLocale.set(evalCase.locale, stats)

    if (options.verbose && !(rank >= 0 && rank < 3)) {
      const status = rank === -1 ? "MISS" : "T10"
      failures.push(
        `${status}\t${evalCase.locale}\t${evalCase.family}\t${evalCase.prompt}\t-> ${results.slice(0, 3).join(", ") || "<empty>"}`,
      )
    }
  }

  const top1Rate = cases.length === 0 ? 0 : top1 / cases.length
  const top3Rate = cases.length === 0 ? 0 : top3 / cases.length

  process.stdout.write(
    `${JSON.stringify(
      {
        cases: cases.length,
        top1,
        top1Rate: Number(top1Rate.toFixed(3)),
        top3,
        top3Rate: Number(top3Rate.toFixed(3)),
        empty,
        byLocale: Object.fromEntries(byLocale),
      },
      null,
      2,
    )}\n`,
  )

  if (options.verbose && failures.length > 0) {
    process.stdout.write(`${failures.join("\n")}\n`)
  }

  if (top1Rate < options.minTop1 || top3Rate < options.minTop3) {
    process.stderr.write(
      `search_tools ranking below threshold: top1=${top1Rate.toFixed(3)} (min ${options.minTop1}), top3=${top3Rate.toFixed(3)} (min ${options.minTop3})\n`,
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
})
