import {
  integrationMetaCatalogService,
  metaCatalogSyncRunService,
  productService,
  workspaceService,
} from "@chatbotx.io/business"
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

const MAX_POLL_ATTEMPTS = 12
const BASE_POLL_DELAY_MS = 5000

const pollDelay = (attempt: number): number =>
  Math.min(BASE_POLL_DELAY_MS * 2 ** attempt, 60_000)

export async function checkMetaCatalogSync(
  data: JobCheckMetaCatalogSync["data"],
): Promise<void> {
  const run = await metaCatalogSyncRunService.findById(data.runId)
  if (run.status !== "running") {
    return
  }

  try {
    const connection =
      await integrationMetaCatalogService.findByWorkspaceIdOrFail(
        data.workspaceId,
      )
    const { catalogId } = connection
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
          retailerIds: batch.retailerIds,
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
      return
    }

    const results = checks.flatMap((check) => check.results)
    const requestedRetailerIds = Array.from(
      new Set(run.handles.flatMap((batch) => batch.retailerIds)),
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
    const successfulRetailerIds = requestedRetailerIds.filter(
      (retailerId) => resultsByRetailerId.get(retailerId)?.success,
    )
    const existingLinks = await metaCatalogItemRepository.findByRetailerIds({
      integrationMetaCatalogId: connection.id,
      catalogId,
      retailerIds: successfulRetailerIds,
    })
    const productIdByRetailerId = new Map(
      existingLinks.map((item) => [item.retailerId, item.productId]),
    )
    const retailerIdByProductId = new Map(
      successfulRetailerIds.map((retailerId) => [
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
    const message =
      error instanceof Error
        ? error.message
        : "Meta Catalog status check failed"
    logger.error({ err: error, runId: data.runId }, message)
    if (isInvalidMetaTokenError(error)) {
      await integrationMetaCatalogService.markInvalid(data.workspaceId)
    }
    await metaCatalogSyncRunService.fail(data.runId, error)
  }
}
