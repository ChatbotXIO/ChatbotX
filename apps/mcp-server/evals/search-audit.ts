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
 * `--corpus multilingual` swaps in the standalone probe corpus from
 * `cases-multilingual.ts` (see that file's header) instead of the default
 * `cases.ts` corpus, and reports per-locale rank plus a paired `en` vs
 * other-locale comparison per family. Use `--report-only` with it: the
 * multilingual corpus has no tuned pass/fail thresholds, it exists to
 * surface where the ranker loses a non-English intent.
 *
 * Usage:
 *   pnpm --filter chatbotx-mcp eval:search --spec <absolute-spec-path> \
 *     [--min-top1 0.65] [--min-top3 0.85] [--verbose]
 *     [--corpus business|multilingual] [--report-only]
 */
import { readFile } from "node:fs/promises"
import { isAbsolute } from "node:path"
import { materializeCases } from "./cases"
import { materializeMultilingualCases } from "./cases-multilingual"

type CorpusName = "business" | "multilingual"

type CliOptions = {
  corpus: CorpusName
  minTop1: number
  minTop3: number
  reportOnly: boolean
  spec: string
  verbose: boolean
}

const usage =
  "Usage:\n  pnpm --filter chatbotx-mcp eval:search --spec <absolute-spec-path> [--min-top1 0.65] [--min-top3 0.85] [--verbose] [--corpus business|multilingual] [--report-only]"

const DEFAULT_MIN_TOP1 = 0.65
const DEFAULT_MIN_TOP3 = 0.85

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    corpus: "business",
    minTop1: DEFAULT_MIN_TOP1,
    minTop3: DEFAULT_MIN_TOP3,
    reportOnly: false,
    verbose: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--verbose") {
      options.verbose = true
      continue
    }
    if (argument === "--report-only") {
      options.reportOnly = true
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

  const cases =
    options.corpus === "multilingual"
      ? materializeMultilingualCases()
      : materializeCases()
  const byLocale = new Map<string, LocaleStats>()
  const rankByFamilyLocale = new Map<string, number>()
  let top1 = 0
  let top3 = 0
  let empty = 0
  const failures: string[] = []

  for (const evalCase of cases) {
    const results = searchTools(evalCase.prompt, 10).map((tool) => tool.name)
    const rank = results.findIndex((name) =>
      evalCase.expectedTools.includes(name),
    )
    rankByFamilyLocale.set(`${evalCase.family}:${evalCase.locale}`, rank)
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

  // Paired comparison: for each family, how much does the rank degrade
  // going from `en` to every other locale. This is what actually answers
  // "does the ranker lose the intent for this language" -- a locale's raw
  // top1Rate alone conflates easy families with hard ones.
  const pairedRegressions =
    options.corpus === "multilingual"
      ? [...new Set(cases.map((evalCase) => evalCase.family))].flatMap(
          (family) => {
            const enRank = rankByFamilyLocale.get(`${family}:en`) ?? -1
            return [...new Set(cases.map((evalCase) => evalCase.locale))]
              .filter((locale) => locale !== "en")
              .map((locale) => ({
                enRank,
                family,
                locale,
                localeRank: rankByFamilyLocale.get(`${family}:${locale}`) ?? -1,
              }))
              .filter(({ localeRank }) => localeRank !== enRank)
          },
        )
      : []

  process.stdout.write(
    `${JSON.stringify(
      {
        cases: cases.length,
        corpus: options.corpus,
        top1,
        top1Rate: Number(top1Rate.toFixed(3)),
        top3,
        top3Rate: Number(top3Rate.toFixed(3)),
        empty,
        byLocale: Object.fromEntries(byLocale),
        ...(options.corpus === "multilingual" ? { pairedRegressions } : {}),
      },
      null,
      2,
    )}\n`,
  )

  if (options.verbose && failures.length > 0) {
    process.stdout.write(`${failures.join("\n")}\n`)
  }

  if (
    !options.reportOnly &&
    (top1Rate < options.minTop1 || top3Rate < options.minTop3)
  ) {
    process.stderr.write(
      `search_tools ranking below threshold: top1=${top1Rate.toFixed(3)} (min ${options.minTop1}), top3=${top3Rate.toFixed(3)} (min ${options.minTop3})\n`,
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
