import {
  integrationMetaCatalogService,
  metaCatalogImportService,
  metaCatalogSyncRunService,
} from "@chatbotx.io/business"
import {
  getCatalogProductsPage,
  isInvalidMetaTokenError,
  MAX_META_CATALOG_PRODUCT_PAGES,
  toImportedMetaProduct,
} from "@chatbotx.io/integration-meta-catalog"
import type { JobImportMetaCatalogProducts } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

type ImportCounters = {
  total: number
  imported: number
  failed: number
}

/** Keeps the persisted `importError` readable when a catalog fails in many ways. */
const MAX_REPORTED_REASONS = 3

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
 * Both records of the same outcome, written together: the connection carries the
 * "latest import" summary the Import tab reads, the run row is the entry that
 * stays in history. Missing the run write would leave it active forever and,
 * since only one run per workspace may be active, block every later sync.
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

export async function importMetaCatalogProducts(
  data: JobImportMetaCatalogProducts["data"],
): Promise<void> {
  const { runId } = data
  const connection = await integrationMetaCatalogService.claimImport(
    data.integrationMetaCatalogId,
  )
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
  if (runId) {
    await metaCatalogSyncRunService.claim(runId)
  }

  const counters: ImportCounters = { total: 0, imported: 0, failed: 0 }
  const failureReasons = new Map<string, number>()
  const addFailureReason = (reason: string, count = 1) =>
    failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + count)
  try {
    const { catalogId } = connection
    if (!catalogId) {
      throw new Error("Meta Catalog is not selected")
    }
    const [accessToken, auth] = await Promise.all([
      integrationMetaCatalogService.resolveToken(connection.id),
      integrationMetaCatalogService.resolveAuth(connection.id),
    ])
    let after: string | undefined
    for (
      let pageIndex = 0;
      pageIndex < MAX_META_CATALOG_PRODUCT_PAGES;
      pageIndex++
    ) {
      const page = await getCatalogProductsPage({
        accessToken,
        catalogId,
        version: auth.version,
        after,
      })
      counters.total += page.products.length + page.invalidCount
      counters.failed += page.invalidCount
      if (page.invalidCount > 0) {
        addFailureReason(
          "Meta returned a product in an unexpected shape",
          page.invalidCount,
        )
      }
      const mapped = page.products.map(toImportedMetaProduct)
      const validProducts = mapped
        .filter((result) => result.ok)
        .map((result) => result.product)
      counters.failed += mapped.length - validProducts.length
      for (const result of mapped) {
        if (!result.ok) {
          addFailureReason(result.reason)
        }
      }

      const result = await metaCatalogImportService.importPage({
        workspaceId: data.workspaceId,
        integrationMetaCatalogId: connection.id,
        catalogId,
        products: validProducts,
      })
      counters.imported += result.imported + result.existing
      await Promise.all([
        integrationMetaCatalogService.updateImportProgress({
          connectionId: connection.id,
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

      after = page.nextCursor
      if (!after) {
        if (counters.failed > 0) {
          logger.warn(
            {
              connectionId: connection.id,
              failed: counters.failed,
              reasons: Object.fromEntries(failureReasons),
            },
            "Meta Catalog import skipped products",
          )
        }
        await finishImport({
          connectionId: connection.id,
          runId,
          counters,
          error:
            counters.failed > 0
              ? `${counters.failed} Meta products could not be imported: ${describeFailures(failureReasons)}`
              : undefined,
        })
        return
      }
    }
    counters.failed += 1
    await finishImport({
      connectionId: connection.id,
      runId,
      counters,
      error: `Meta Catalog exceeds the ${MAX_META_CATALOG_PRODUCT_PAGES}-page import limit`,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Meta Catalog import failed"
    logger.error({ err: error, connectionId: connection.id }, message)
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
