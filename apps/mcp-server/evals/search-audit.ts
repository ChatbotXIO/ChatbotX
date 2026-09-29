/**
 * Offline gate for `search_tools` ranking quality -- no LLM, no API key,
 * runs in a few seconds. Loads the real spec (dumped via
 * `MCP_EVAL_SPEC_OUTPUT=<path> pnpm --filter builder test --
 * public-spec-operations.test.ts`, see `apps/builder/__tests__/public-spec-operations.test.ts`),
 * stubs `fetch` to serve it, and scores each eval case's atomic action/resource
 * probe through `searchTools()` directly. English top-1/top-3 rates must meet
 * the given thresholds, while other locales remain report-only because clients
 * translate them before they reach this ranker. This catches ranking or
 * description changes without needing `eval:business`'s LLM round trips.
 *
 * `--corpus multilingual` swaps in the standalone probe corpus from
 * `cases-multilingual.ts` (see that file's header) instead of the default
 * `cases.ts` corpus, and reports per-locale rank plus a paired `en` vs
 * other-locale comparison per family and atomic probe. Use `--report-only`
 * with it: the multilingual corpus has no tuned pass/fail thresholds, it
 * exists to surface where the ranker loses a non-English intent.
 *
 * Usage:
 *   pnpm --filter chatbotx-mcp eval:search --spec <absolute-spec-path> \
 *     [--min-top1 0.65] [--min-top3 0.85] [--verbose]
 *     [--corpus business|multilingual] [--report-only]
 */
import { readFile } from "node:fs/promises"
import { isAbsolute } from "node:path"
import { loadOpenApiSpec } from "../src/openapi-loader"
import { searchTools } from "../src/server/meta-tools"
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

  await loadOpenApiSpec()

  const cases =
    options.corpus === "multilingual"
      ? materializeMultilingualCases()
      : materializeCases()
  const probes = cases.flatMap((evalCase) =>
    (
      evalCase.searchQueries ?? [
        { expectedTools: evalCase.expectedTools, query: evalCase.prompt },
      ]
    ).map((searchQuery, index) => ({
      evalCase,
      expectedTools: searchQuery.expectedTools,
      index,
      query: searchQuery.query,
    })),
  )
  const byLocale = new Map<string, LocaleStats>()
  const rankByFamilyLocale = new Map<string, number>()
  let top1 = 0
  let top3 = 0
  let empty = 0
  const failures: string[] = []

  for (const probe of probes) {
    const results = searchTools(probe.query, 10).map((tool) => tool.name)
    const rank = results.findIndex((name) => probe.expectedTools.includes(name))
    const rankKey = `${probe.evalCase.family}:${probe.evalCase.locale}:${probe.index}`
    rankByFamilyLocale.set(rankKey, rank)
    const stats = byLocale.get(probe.evalCase.locale) ?? {
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
    byLocale.set(probe.evalCase.locale, stats)

    if (options.verbose && !(rank >= 0 && rank < 3)) {
      const status = rank === -1 ? "MISS" : "T10"
      failures.push(
        `${status}\t${probe.evalCase.locale}\t${probe.evalCase.family}\t${probe.query}\t-> ${results.slice(0, 3).join(", ") || "<empty>"}`,
      )
    }
  }

  const englishStats = byLocale.get("en") ?? {
    empty: 0,
    n: 0,
    top1: 0,
    top3: 0,
  }
  const englishTop1Rate =
    englishStats.n === 0 ? 0 : englishStats.top1 / englishStats.n
  const englishTop3Rate =
    englishStats.n === 0 ? 0 : englishStats.top3 / englishStats.n

  const top1Rate = probes.length === 0 ? 0 : top1 / probes.length
  const top3Rate = probes.length === 0 ? 0 : top3 / probes.length

  // Paired comparison: for each family, how much does the rank degrade
  // going from `en` to every other locale. This is what actually answers
  // "does the ranker lose the intent for this language" -- a locale's raw
  // top1Rate alone conflates easy families with hard ones.
  const pairedRegressions =
    options.corpus === "multilingual"
      ? probes
          .filter((probe) => probe.evalCase.locale === "en")
          .flatMap((probe) =>
            [...new Set(cases.map((evalCase) => evalCase.locale))]
              .filter((locale) => locale !== "en")
              .map((locale) => {
                const { family } = probe.evalCase
                return {
                  enRank:
                    rankByFamilyLocale.get(`${family}:en:${probe.index}`) ?? -1,
                  family,
                  locale,
                  localeRank:
                    rankByFamilyLocale.get(
                      `${family}:${locale}:${probe.index}`,
                    ) ?? -1,
                }
              })
              .filter(({ enRank, localeRank }) => localeRank !== enRank),
          )
      : []

  process.stdout.write(
    `${JSON.stringify(
      {
        cases: cases.length,
        queries: probes.length,
        corpus: options.corpus,
        top1,
        top1Rate: Number(top1Rate.toFixed(3)),
        top3,
        top3Rate: Number(top3Rate.toFixed(3)),
        empty,
        byLocale: Object.fromEntries(byLocale),
        thresholdLocale: "en",
        thresholdTop1Rate: Number(englishTop1Rate.toFixed(3)),
        thresholdTop3Rate: Number(englishTop3Rate.toFixed(3)),
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
    (englishTop1Rate < options.minTop1 || englishTop3Rate < options.minTop3)
  ) {
    process.stderr.write(
      `search_tools ranking below threshold for en: top1=${englishTop1Rate.toFixed(3)} (min ${options.minTop1}), top3=${englishTop3Rate.toFixed(3)} (min ${options.minTop3})\n`,
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
