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
  isDefiniteMetaRequestRejection,
  isInvalidMetaTokenError,
  resolveRetailerIds,
  submitItemsBatch,
  toMetaItem,
} from "@chatbotx.io/integration-meta-catalog"
import {
  DefaultJobAction,
  defaultQueue,
  type JobSubmitMetaCatalogSync,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { safeMetaCatalogErrorLog } from "./safe-error-log"

const INTERRUPTED_ITEM_REASON =
  "Submission was interrupted; sync this item again"
const SUBMISSION_LEASE_LOST = new Error("Meta Catalog submission lease lost")
const SUBMISSION_STALE_MS = 2 * 60 * 1000

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const enqueueFirstCheck = async (input: {
  workspaceId: string
  runId: string
}) => {
  await defaultQueue.add(
    DefaultJobAction.checkMetaCatalogSync,
    {
      type: DefaultJobAction.checkMetaCatalogSync,
      data: { ...input, attempt: 0 },
    },
    {
      delay: 5000,
      jobId: `mc-check-${input.runId}-0`,
    },
  )
}

export async function submitMetaCatalogSync(
  data: JobSubmitMetaCatalogSync["data"],
): Promise<void> {
  const run = data.recovery
    ? await metaCatalogSyncRunService.claimStaleSubmission({
        runId: data.runId,
        workspaceId: data.workspaceId,
        staleBefore: new Date(Date.now() - SUBMISSION_STALE_MS),
      })
    : await metaCatalogSyncRunService.claimSubmission({
        runId: data.runId,
        workspaceId: data.workspaceId,
      })
  if (!run) {
    return
  }
  const { submissionLeaseId } = run
  if (!submissionLeaseId) {
    return
  }

  const handles: MetaCatalogBatchHandle[] = [...(run.handles ?? [])]
  let hasIndeterminateSubmission = false
  try {
    const [connection, workspace] = await Promise.all([
      integrationMetaCatalogService.findByWorkspaceIdOrFail(data.workspaceId),
      workspaceService.find({ where: { id: data.workspaceId } }),
    ])
    if (run.integrationMetaCatalogId !== connection.id) {
      throw new Error("Meta Catalog sync run does not match its connection")
    }
    // New runs own an immutable destination. The connection fallback is only
    // for rows queued before catalogId was persisted on the run.
    const catalogId = run.catalogId ?? connection.catalogId
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
    // A SKU is only free if no other item in the catalog already answers to it,
    // links outside this run's scope included — reusing one would repoint that
    // item at the wrong product.
    const skuClaims = await metaCatalogItemRepository.findByRetailerIds({
      integrationMetaCatalogId: connection.id,
      catalogId,
      retailerIds: products
        .map((product) => product.sku?.trim())
        .filter((sku): sku is string => Boolean(sku)),
    })
    const retailerIdByProductId = resolveRetailerIds({
      products,
      linkedByProductId: new Map(
        existingLinks.map((item) => [item.productId, item.retailerId]),
      ),
      ownerByRetailerId: new Map(
        skuClaims.map((item) => [item.retailerId, item.productId]),
      ),
    })
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
    const priorItemErrors = (run.itemErrors ?? []).filter(
      (item) => item.reason !== INTERRUPTED_ITEM_REASON,
    )
    // Handles are durable operational state. Diagnostic errors are capped for
    // the UI and therefore must never decide what recovery considers settled.
    const settledRetailerIds = new Set(
      handles.flatMap((batch) =>
        "items" in batch
          ? batch.items.map((item) => item.retailerId)
          : batch.retailerIds,
      ),
    )
    const accepted = mapped
      .filter((item) => item.ok)
      .filter((item) => !settledRetailerIds.has(item.retailerId))
    const linkedRetailerIds = new Set(
      existingLinks.map((item) => item.retailerId),
    )
    const itemErrors: Array<{ retailerId: string; reason: string }> = [
      ...priorItemErrors,
    ]
    const batches = chunk(accepted, CATALOG_BATCH_SIZE)
    const totalCount = Math.max(run.totalCount ?? 0, products.length)
    const checkpoint = async (nextBatchIndex: number) => {
      const pendingItems = batches
        .slice(nextBatchIndex)
        .flatMap((pendingBatch) =>
          pendingBatch.map((item) => ({
            retailerId: item.retailerId,
            reason: INTERRUPTED_ITEM_REASON,
          })),
        )
      const saved = await metaCatalogSyncRunService.recordSubmission({
        runId: run.id,
        submissionLeaseId,
        totalCount,
        handles,
        skippedItems: skipped,
        // Confirmed failures only — `pendingItems` are batches not yet
        // submitted, not failures, so they must stay out of failedCount.
        failedCount: itemErrors.length,
        itemErrors: [...itemErrors, ...pendingItems],
      })
      if (!saved) {
        throw SUBMISSION_LEASE_LOST
      }
    }
    // Persist the scope and provisional unsent tail before talking to Graph.
    // A retry can distinguish settled items from batches it must re-submit.
    await checkpoint(0)
    const auth = await integrationMetaCatalogService.resolveAuth(connection.id)

    for (const [batchIndex, batch] of batches.entries()) {
      let response: Awaited<ReturnType<typeof submitItemsBatch>>
      try {
        response = await submitItemsBatch({
          accessToken: auth.accessToken,
          catalogId,
          version: auth.version,
          requests: batch.map((item) => ({
            // Recovery follows an indeterminate request: UPDATE safely finds
            // an item Meta may already have accepted, while another CREATE
            // could only report "retailer_id already exists" without linking.
            method:
              data.recovery || linkedRetailerIds.has(item.retailerId)
                ? "UPDATE"
                : "CREATE",
            retailerId: item.retailerId,
            data: item.data,
          })),
        })
      } catch (error) {
        // Continue only when Graph confirms a parameter-validation rejection.
        // A transport, throttling, permission, or 5xx failure is systemic or
        // may happen after Meta accepted the batch, so treating it as a final
        // per-item rejection could create untracked remote products.
        if (
          isInvalidMetaTokenError(error) ||
          !isDefiniteMetaRequestRejection(error)
        ) {
          hasIndeterminateSubmission = true
          throw error
        }
        const reason =
          error instanceof Error ? error.message : "Meta rejected this batch"
        itemErrors.push(
          ...batch.map((item) => ({ retailerId: item.retailerId, reason })),
        )
        await checkpoint(batchIndex + 1)
        continue
      }
      handles.push(
        ...response.handles.map((handle) => ({
          handle,
          items: batch.map((item) => ({
            productId: item.productId,
            retailerId: item.retailerId,
          })),
        })),
      )
      // Persist accepted handles before any later Graph request. The pending
      // items are provisional failures so a crash produces an honest partial
      // result instead of silently dropping the unsubmitted tail.
      await checkpoint(batchIndex + 1)
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

    await checkpoint(batches.length)
    const finishedSubmission = await metaCatalogSyncRunService.finishSubmission(
      run.id,
      submissionLeaseId,
    )
    if (!finishedSubmission) {
      return
    }

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

    await enqueueFirstCheck({
      workspaceId: data.workspaceId,
      runId: run.id,
    })
  } catch (error) {
    if (error === SUBMISSION_LEASE_LOST) {
      return
    }
    const safeLog = safeMetaCatalogErrorLog(
      error,
      "Meta Catalog submission failed",
    )
    logger.error({ ...safeLog.details, runId: data.runId }, safeLog.message)
    if (isInvalidMetaTokenError(error)) {
      await integrationMetaCatalogService.markInvalid(data.workspaceId)
    }
    if (handles.length > 0 || hasIndeterminateSubmission) {
      // Let BullMQ retry dispatch/recovery while the checkpointed run remains
      // pollable. Marking it failed here would orphan accepted Meta batches.
      throw error
    }
    await metaCatalogSyncRunService.fail(data.runId, error)
  }
}
