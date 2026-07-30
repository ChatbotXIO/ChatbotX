import {
  integrationMetaCatalogService,
  metaCatalogSyncRunService,
  productService,
  workspaceService,
} from "@chatbotx.io/business"
import type { MetaCatalogBatchHandle } from "@chatbotx.io/database/partials"
import { metaCatalogItemRepository } from "@chatbotx.io/database/repositories"
import {
  CATALOG_BATCH_SIZE,
  concurrencyForUsage,
  isInvalidMetaTokenError,
  submitItemsBatch,
  toMetaItem,
} from "@chatbotx.io/integration-meta-catalog"
import {
  DefaultJobAction,
  defaultQueue,
  type JobSubmitMetaCatalogSync,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export async function submitMetaCatalogSync(
  data: JobSubmitMetaCatalogSync["data"],
): Promise<void> {
  const run = await metaCatalogSyncRunService.claim(data.runId)
  if (!run) {
    return
  }

  try {
    const [connection, workspace] = await Promise.all([
      integrationMetaCatalogService.findByWorkspaceIdOrFail(data.workspaceId),
      workspaceService.find({ where: { id: data.workspaceId } }),
    ])
    const { catalogId } = connection
    if (!(catalogId && workspace)) {
      throw new Error("Meta Catalog settings are incomplete")
    }

    const products = await productService.listForCatalogSync({
      workspaceId: data.workspaceId,
      categoryId:
        run.scope === "category" ? (run.categoryId ?? undefined) : undefined,
      productIds: run.scope === "selected" ? run.selectedProductIds : undefined,
    })
    const existingLinks = await metaCatalogItemRepository.findByProductIds({
      integrationMetaCatalogId: connection.id,
      catalogId,
      productIds: products.map((product) => product.id),
    })
    const retailerIdByProductId = new Map(
      existingLinks.map((item) => [item.productId, item.retailerId]),
    )
    const mapped = products.map((product) =>
      toMetaItem(
        product,
        {
          currency: connection.currency,
          storeUrl: connection.storeUrl,
          workspaceName: workspace.name,
        },
        retailerIdByProductId.get(product.id),
      ),
    )
    const skipped = mapped
      .filter((item) => !item.ok)
      .map((item) => ({
        productId: item.productId,
        reason: item.reason,
      }))
    const accepted = mapped.filter((item) => item.ok)
    const linkedRetailerIds = new Set(
      existingLinks.map((item) => item.retailerId),
    )
    // Persist the scope before talking to Graph. A run that dies mid-submit
    // otherwise lands in history as "0/0 · 0 failed · 0 skipped", which hides
    // both how much was attempted and which rows were skipped locally.
    await metaCatalogSyncRunService.recordSubmission({
      runId: run.id,
      totalCount: products.length,
      handles: [],
      skippedItems: skipped,
    })
    const auth = await integrationMetaCatalogService.resolveAuth(connection.id)

    const handles: MetaCatalogBatchHandle[] = []
    const itemErrors: Array<{ retailerId: string; reason: string }> = []
    const batches = chunk(accepted, CATALOG_BATCH_SIZE)
    for (const [batchIndex, batch] of batches.entries()) {
      const response = await submitItemsBatch({
        accessToken: auth.accessToken,
        catalogId,
        version: auth.version,
        requests: batch.map((item) => ({
          method: linkedRetailerIds.has(item.retailerId) ? "UPDATE" : "CREATE",
          retailerId: item.retailerId,
          data: item.data,
        })),
      })
      handles.push(
        ...response.handles.map((handle) => ({
          handle,
          retailerIds: batch.map((item) => item.retailerId),
        })),
      )
      if (concurrencyForUsage(response.usage) === 0) {
        itemErrors.push(
          ...batches.slice(batchIndex + 1).flatMap((remainingBatch) =>
            remainingBatch.map((item) => ({
              retailerId: item.retailerId,
              reason: "Meta rate limit reached; retry this item later",
            })),
          ),
        )
        break
      }
    }

    await metaCatalogSyncRunService.recordSubmission({
      runId: run.id,
      totalCount: products.length,
      handles,
      skippedItems: skipped,
      itemErrors,
    })

    if (handles.length === 0) {
      await metaCatalogSyncRunService.complete({
        runId: run.id,
        integrationMetaCatalogId: connection.id,
        catalogId,
        succeededItems: [],
        errors: [],
      })
      return
    }

    await defaultQueue.add(
      DefaultJobAction.checkMetaCatalogSync,
      {
        type: DefaultJobAction.checkMetaCatalogSync,
        data: { workspaceId: data.workspaceId, runId: run.id, attempt: 0 },
      },
      {
        delay: 5000,
        jobId: `mc-check-${run.id}-0`,
      },
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Meta Catalog submission failed"
    logger.error({ err: error, runId: data.runId }, message)
    if (isInvalidMetaTokenError(error)) {
      await integrationMetaCatalogService.markInvalid(data.workspaceId)
    }
    await metaCatalogSyncRunService.fail(data.runId, error)
  }
}
