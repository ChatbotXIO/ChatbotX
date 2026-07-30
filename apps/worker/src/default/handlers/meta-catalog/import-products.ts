import {
  integrationMetaCatalogService,
  metaCatalogImportService,
  metaCatalogSyncRunService,
} from "@chatbotx.io/business"
import {
  getCatalogProductsPage,
  isInvalidMetaTokenError,
  MAX_META_CATALOG_PRODUCT_PAGES,
  type MetaCatalogProductPage,
  toImportedMetaProduct,
} from "@chatbotx.io/integration-meta-catalog"
import type { JobImportMetaCatalogProducts } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { safeMetaCatalogErrorLog } from "./safe-error-log"

type ImportCounters = {
  total: number
  imported: number
  failed: number
}

/** Keeps the persisted `importError` readable when a catalog fails in many ways. */
const MAX_REPORTED_REASONS = 3
const UNEXPECTED_SHAPE_REASON = "Meta returned a product in an unexpected shape"

/**
 * "2 Meta products could not be imported" is unactionable on its own, so the
 * per-product rejection reasons are tallied and surfaced with the count.
 */
const describeFailures = (reasons: Map<string, number>): string => {
  const ranked = [...reasons.entries()].sort(
    ([, first], [, second]) => second - first,
  )
  const shown = ranked
    .slice(0, MAX_REPORTED_REASONS)
    .map(([reason, count]) => `${reason} (${count})`)
  const hidden = ranked.length - shown.length
  return hidden > 0
    ? `${shown.join("; ")}; and ${hidden} other reason(s)`
    : shown.join("; ")
}

/**
 * The running totals of one import, and why anything was left out. Kept out of
 * the handler so the loop reads as "fetch a page, write it, report" instead of
 * as bookkeeping between every step.
 */
const createImportTally = () => {
  const counters: ImportCounters = { total: 0, imported: 0, failed: 0 }
  const reasons = new Map<string, number>()

  const reject = (reason: string, count = 1) => {
    counters.failed += count
    reasons.set(reason, (reasons.get(reason) ?? 0) + count)
  }

  /**
   * Folds one Meta page into the totals and hands back the products worth
   * writing. A product Meta sent in a shape this codebase cannot read never
   * reaches the mapper, so those are counted straight off the page.
   */
  const readPage = (page: MetaCatalogProductPage) => {
    counters.total += page.products.length + page.invalidCount
    if (page.invalidCount > 0) {
      reject(UNEXPECTED_SHAPE_REASON, page.invalidCount)
    }
    const mapped = page.products.map(toImportedMetaProduct)
    for (const result of mapped) {
      if (!result.ok) {
        reject(result.reason)
      }
    }
    return mapped.filter((result) => result.ok).map((result) => result.product)
  }

  const addImported = (count: number) => {
    counters.imported += count
  }

  /** The sentence the workspace reads, or nothing when everything landed. */
  const summarize = () =>
    counters.failed > 0
      ? `${counters.failed} Meta products could not be imported: ${describeFailures(reasons)}`
      : undefined

  return {
    counters,
    reasons,
    reject,
    readPage,
    addImported,
    summarize,
  }
}

/**
 * Progress for a run in flight, written to both records: the connection carries
 * the "latest import" summary the Import tab reads, the run row is what moves in
 * history while the job works.
 */
const reportProgress = async (input: {
  connectionId: string
  runId?: string
  counters: ImportCounters
}) => {
  const { connectionId, runId, counters } = input
  await Promise.all([
    integrationMetaCatalogService.updateImportProgress({
      connectionId,
      totalCount: counters.total,
      importedCount: counters.imported,
      failedCount: counters.failed,
    }),
    runId
      ? metaCatalogSyncRunService.recordImportProgress({
          runId,
          totalCount: counters.total,
          succeededCount: counters.imported,
          failedCount: counters.failed,
        })
      : null,
  ])
}

/**
 * Both records of the same outcome, written together. Missing the run write
 * would leave it active forever and, since only one run per workspace may be
 * active, block every later sync.
 */
const finishImport = async (input: {
  connectionId: string
  runId?: string
  counters: ImportCounters
  error?: string
}) => {
  const { connectionId, runId, counters, error } = input
  await Promise.all([
    integrationMetaCatalogService.completeImport({
      connectionId,
      totalCount: counters.total,
      importedCount: counters.imported,
      failedCount: counters.failed,
      error,
    }),
    runId
      ? metaCatalogSyncRunService.completeImport({
          runId,
          totalCount: counters.total,
          succeededCount: counters.imported,
          failedCount: counters.failed,
          error,
        })
      : null,
  ])
}

/**
 * Meta has no more pages, so this is the final verdict. Anything left out is
 * logged for support as well as persisted, because the stored sentence is capped
 * at the three most common reasons while the log keeps all of them.
 */
const finishAfterLastPage = async (input: {
  connectionId: string
  runId?: string
  tally: ReturnType<typeof createImportTally>
}) => {
  const { connectionId, runId, tally } = input
  if (tally.counters.failed > 0) {
    logger.warn(
      {
        connectionId,
        failed: tally.counters.failed,
        reasons: Object.fromEntries(tally.reasons),
      },
      "Meta Catalog import skipped products",
    )
  }
  await finishImport({
    connectionId,
    runId,
    counters: tally.counters,
    error: tally.summarize(),
  })
}

export async function importMetaCatalogProducts(
  data: JobImportMetaCatalogProducts["data"],
): Promise<void> {
  const { runId } = data
  const run = runId
    ? await metaCatalogSyncRunService.claim({
        runId,
        workspaceId: data.workspaceId,
      })
    : undefined
  if (runId && !run) {
    return
  }
  const connection = await integrationMetaCatalogService.claimImport({
    connectionId: data.integrationMetaCatalogId,
    workspaceId: data.workspaceId,
  })
  if (!connection) {
    // Another import already holds the connection. The run row cannot be left
    // queued: only one run per workspace may be active, so it would block every
    // later sync and import in this workspace.
    if (runId) {
      await metaCatalogSyncRunService.fail(
        runId,
        "Another Meta Catalog import was already running",
      )
    }
    return
  }
  const tally = createImportTally()
  const { counters } = tally
  let catalogId: string | undefined
  let pageIndex = 0
  let phase = "validate-import"
  try {
    if (run && run.integrationMetaCatalogId !== connection.id) {
      throw new Error("Meta Catalog import run does not match its connection")
    }
    // New history rows snapshot the source catalog. Keep the connection
    // fallback solely for legacy jobs that predate run catalog snapshots.
    catalogId = run?.catalogId ?? connection.catalogId ?? undefined
    if (!catalogId) {
      throw new Error("Meta Catalog is not selected")
    }
    phase = "resolve-auth"
    const auth = await integrationMetaCatalogService.resolveAuth(connection.id)
    let after: string | undefined
    for (
      pageIndex = 0;
      pageIndex < MAX_META_CATALOG_PRODUCT_PAGES;
      pageIndex++
    ) {
      phase = "fetch-products"
      const page = await getCatalogProductsPage({
        accessToken: auth.accessToken,
        catalogId,
        version: auth.version,
        after,
      })
      phase = "import-products"
      const result = await metaCatalogImportService.importPage({
        workspaceId: data.workspaceId,
        integrationMetaCatalogId: connection.id,
        catalogId,
        products: tally.readPage(page),
      })
      tally.addImported(result.imported + result.existing)
      phase = "report-progress"
      await reportProgress({ connectionId: connection.id, runId, counters })

      after = page.nextCursor
      if (!after) {
        phase = "finish-import"
        await finishAfterLastPage({ connectionId: connection.id, runId, tally })
        return
      }
    }
    const pageLimitReason = `Meta Catalog exceeds the ${MAX_META_CATALOG_PRODUCT_PAGES}-page import limit`
    tally.reject(pageLimitReason)
    await finishImport({
      connectionId: connection.id,
      runId,
      counters,
      error: pageLimitReason,
    })
  } catch (error) {
    const safeLog = safeMetaCatalogErrorLog(error, "Meta Catalog import failed")
    logger.error(
      {
        ...safeLog.details,
        connectionId: connection.id,
        workspaceId: data.workspaceId,
        runId,
        catalogId,
        pageIndex,
        phase,
      },
      safeLog.message,
    )
    if (isInvalidMetaTokenError(error)) {
      await integrationMetaCatalogService.markInvalid(data.workspaceId)
    }
    // The thrown value goes to both, not a flattened message: each service
    // scrubs it and pulls out the channel's own user-facing wording itself.
    await Promise.all([
      integrationMetaCatalogService.failImport(connection.id, error),
      runId ? metaCatalogSyncRunService.fail(runId, error) : null,
    ])
  }
}
