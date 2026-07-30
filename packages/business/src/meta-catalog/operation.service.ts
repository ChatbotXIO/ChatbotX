import { db } from "@chatbotx.io/database/client"
import type { MetaCatalogSyncScope } from "@chatbotx.io/database/partials"
import { BaseService } from "../base.service"
import { ChatbotXException } from "../errors"
import { integrationMetaCatalogService } from "./integration.service"
import { metaCatalogSyncRunService } from "./sync-run.service"

const ACTIVE_IMPORT_STATUSES = new Set(["queued", "running"])

class MetaCatalogOperationService extends BaseService {
  /**
   * Reserves the workspace-wide active-run slot before changing the connection
   * to queued. Both writes share one transaction, so a collision cannot leave
   * an import flag behind without a corresponding job/run.
   */
  async startImport(input: {
    workspaceId: string
    catalogId: string
    catalogName?: string
    businessId?: string
  }) {
    return await db.transaction(async (tx) => {
      const connection =
        await integrationMetaCatalogService.lockByWorkspaceIdOrFail(
          input.workspaceId,
          tx,
        )
      // Jobs created before sync runs existed are represented only by this
      // connection flag. They must finish before a push can rebind catalogId.
      if (ACTIVE_IMPORT_STATUSES.has(connection.importStatus)) {
        throw new ChatbotXException(
          "A Meta Catalog sync is already running",
          "metaCatalogSyncAlreadyRunning",
        )
      }
      const run = await metaCatalogSyncRunService.create(
        {
          workspaceId: input.workspaceId,
          integrationMetaCatalogId: connection.id,
          direction: "import",
          catalogId: input.catalogId,
          scope: "all",
        },
        tx,
      )
      const selected = await integrationMetaCatalogService.selectCatalog({
        ...input,
        tx,
      })
      return { connection: selected, run }
    })
  }

  /**
   * A push run owns the destination supplied by its request. The catalog
   * binding is updated only after the run slot is reserved, and rolls back with
   * the run if either write fails.
   */
  async startPush(input: {
    workspaceId: string
    catalogId: string
    catalogName?: string
    businessId?: string
    scope: MetaCatalogSyncScope
    categoryId?: string
    selectedProductIds?: string[]
  }) {
    return await db.transaction(async (tx) => {
      const connection =
        await integrationMetaCatalogService.lockByWorkspaceIdOrFail(
          input.workspaceId,
          tx,
        )
      // Legacy imports have no run row, so the unique active-run index cannot
      // see them. Respect the connection flag before reserving or rebinding.
      if (ACTIVE_IMPORT_STATUSES.has(connection.importStatus)) {
        throw new ChatbotXException(
          "A Meta Catalog sync is already running",
          "metaCatalogSyncAlreadyRunning",
        )
      }
      const run = await metaCatalogSyncRunService.create(
        {
          workspaceId: input.workspaceId,
          integrationMetaCatalogId: connection.id,
          catalogId: input.catalogId,
          scope: input.scope,
          categoryId: input.categoryId,
          selectedProductIds: input.selectedProductIds,
        },
        tx,
      )
      if (connection.catalogId !== input.catalogId) {
        await integrationMetaCatalogService.bindCatalog({
          workspaceId: input.workspaceId,
          catalogId: input.catalogId,
          catalogName: input.catalogName,
          businessId: input.businessId,
          tx,
        })
      }
      return run
    })
  }
}

export const metaCatalogOperationService = new MetaCatalogOperationService()
