import {
  integrationMetaCatalogService,
  metaCatalogSyncRunService,
  productService,
  workspaceService,
} from "@chatbotx.io/business"
import type { MetaCatalogBatchHandle } from "@chatbotx.io/database/partials"
import { metaCatalogItemRepository } from "@chatbotx.io/database/repositories"
import {
  checkItemsBatch,
  fingerprintMetaItem,
  isInvalidMetaTokenError,
  toMetaItem,
} from "@chatbotx.io/integration-meta-catalog"
import {
  DefaultJobAction,
  defaultQueue,
  type JobCheckMetaCatalogSync,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { safeMetaCatalogErrorLog } from "./safe-error-log"

const MAX_POLL_ATTEMPTS = 12
const BASE_POLL_DELAY_MS = 5000

class CheckDispatchError extends Error {
  readonly cause: unknown

  constructor(cause: unknown) {
    super("Failed to dispatch the next Meta Catalog status check")
    this.cause = cause
  }
}

const pollDelay = (attempt: number): number =>
  Math.min(BASE_POLL_DELAY_MS * 2 ** attempt, 60_000)

const getBatchRetailerIds = (batch: MetaCatalogBatchHandle): string[] =>
  "items" in batch
    ? batch.items.map((item) => item.retailerId)
    : batch.retailerIds

export async function checkMetaCatalogSync(
  data: JobCheckMetaCatalogSync["data"],
): Promise<void> {
  const run = await metaCatalogSyncRunService.findById({
    runId: data.runId,
    workspaceId: data.workspaceId,
  })
  if (run.status !== "running") {
    return
  }

  try {
    const connection =
      await integrationMetaCatalogService.findByWorkspaceIdOrFail(
        data.workspaceId,
      )
    if (run.integrationMetaCatalogId !== connection.id) {
      throw new Error("Meta Catalog sync run does not match its connection")
    }
    // Poll the catalog that produced these handles, never a later UI binding.
    const catalogId = run.catalogId ?? connection.catalogId
    if (!catalogId) {
      throw new Error("Meta Catalog is not selected")
    }
    const auth = await integrationMetaCatalogService.resolveAuth(connection.id)
    const checks = await Promise.all(
      run.handles.map((batch) =>
        checkItemsBatch({
          accessToken: auth.accessToken,
          catalogId,
          handle: batch.handle,
          retailerIds: getBatchRetailerIds(batch),
          version: auth.version,
        }),
      ),
    )

    if (checks.some((check) => !check.completed)) {
      if (data.attempt >= MAX_POLL_ATTEMPTS) {
        throw new Error("Meta Catalog batch status timed out")
      }
      const nextAttempt = data.attempt + 1
      await metaCatalogSyncRunService.incrementPollAttempt(run.id)
      try {
        await defaultQueue.add(
          DefaultJobAction.checkMetaCatalogSync,
          {
            type: DefaultJobAction.checkMetaCatalogSync,
            data: {
              workspaceId: data.workspaceId,
              runId: run.id,
              attempt: nextAttempt,
            },
          },
          {
            delay: pollDelay(nextAttempt),
            jobId: `mc-check-${run.id}-${nextAttempt}`,
          },
        )
      } catch (error) {
        throw new CheckDispatchError(error)
      }
      return
    }

    const results = checks.flatMap((check) => check.results)
    // Submission recorded which productId asked for which retailerId, so this
    // never has to guess one from the other — a retailerId is frequently a
    // product's SKU, not its id, and re-deriving the productId from it later
    // silently mismatched every brand-new item whose Content ID was a SKU.
    const productIdByRetailerId = new Map(
      run.handles.flatMap((batch) =>
        "items" in batch
          ? batch.items.map(
              (item) => [item.retailerId, item.productId] as const,
            )
          : [],
      ),
    )
    const legacyRetailerIds = run.handles.flatMap((batch) =>
      "retailerIds" in batch ? batch.retailerIds : [],
    )
    if (legacyRetailerIds.length > 0) {
      const legacyLinks = await metaCatalogItemRepository.findByRetailerIds({
        integrationMetaCatalogId: connection.id,
        catalogId,
        retailerIds: legacyRetailerIds,
      })
      const linkedProductIdByRetailerId = new Map(
        legacyLinks.map((item) => [item.retailerId, item.productId]),
      )
      for (const retailerId of legacyRetailerIds) {
        productIdByRetailerId.set(
          retailerId,
          linkedProductIdByRetailerId.get(retailerId) ?? retailerId,
        )
      }
    }
    const requestedRetailerIds = Array.from(
      new Set(run.handles.flatMap(getBatchRetailerIds)),
    )
    const resultsByRetailerId = new Map(
      results
        .filter((result) => result.retailerId)
        .map((result) => [result.retailerId, result]),
    )
    const errors = requestedRetailerIds.flatMap((retailerId) => {
      const result = resultsByRetailerId.get(retailerId)
      if (result?.success) {
        return []
      }
      return [
        {
          retailerId,
          reason:
            result?.error ??
            "Meta did not return a result for this catalog item",
        },
      ]
    })
    const successfulRetailerIds = new Set(
      requestedRetailerIds.filter(
        (retailerId) => resultsByRetailerId.get(retailerId)?.success,
      ),
    )
    const retailerIdByProductId = new Map(
      requestedRetailerIds
        .filter((retailerId) => successfulRetailerIds.has(retailerId))
        .map((retailerId) => [
          productIdByRetailerId.get(retailerId) ?? retailerId,
          retailerId,
        ]),
    )
    const [products, workspace] = await Promise.all([
      productService.listForCatalogSync({
        workspaceId: data.workspaceId,
        productIds: Array.from(retailerIdByProductId.keys()),
      }),
      workspaceService.find({ where: { id: data.workspaceId } }),
    ])
    if (!workspace) {
      throw new Error("Workspace not found")
    }
    const loadedProductIds = new Set(products.map((product) => product.id))
    for (const retailerId of successfulRetailerIds) {
      const productId = productIdByRetailerId.get(retailerId) ?? retailerId
      if (!loadedProductIds.has(productId)) {
        errors.push({
          retailerId,
          reason:
            "The local product for this legacy Meta sync could not be resolved; sync this item again",
        })
      }
    }
    const succeededItems = products.flatMap((product) => {
      const mapped = toMetaItem(
        product,
        {
          currency: connection.currency,
          storeUrl: connection.storeUrl,
          workspaceName: workspace.name,
        },
        retailerIdByProductId.get(product.id),
      )
      return mapped.ok
        ? [
            {
              productId: mapped.productId,
              retailerId: mapped.retailerId,
              fingerprint: fingerprintMetaItem(mapped.data),
            },
          ]
        : []
    })
    await metaCatalogSyncRunService.complete({
      runId: run.id,
      integrationMetaCatalogId: connection.id,
      catalogId,
      succeededItems,
      errors,
    })
  } catch (error) {
    if (error instanceof CheckDispatchError) {
      // Keep the run active. BullMQ retries this job, and the scheduled
      // reconciler is the durable fallback if Redis stays unavailable.
      throw error.cause
    }
    const safeLog = safeMetaCatalogErrorLog(
      error,
      "Meta Catalog status check failed",
    )
    logger.error({ ...safeLog.details, runId: data.runId }, safeLog.message)
    if (isInvalidMetaTokenError(error)) {
      await integrationMetaCatalogService.markInvalid(data.workspaceId)
    }
    await metaCatalogSyncRunService.fail(data.runId, error)
  }
}
