import type { EncryptedData } from "@chatbotx.io/encryption"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
  sql,
} from "../../client"
import {
  integrationMessengerModel,
  messengerMessageTemplateModel,
} from "../../schema"
import type { IntegrationMessengerModel } from "../../types"

type MessengerMessageTemplateModel =
  typeof messengerMessageTemplateModel.$inferSelect

type WorkspaceIntegrationRef = {
  id: string
  workspaceId: string
}

type UpdateMessengerCapiScopeCacheInput = WorkspaceIntegrationRef & {
  hasCapiScope: boolean
  capiScopeCheckedAt: Date | null
  expectedCapiScopeCheckedAt: Date | null
}

type ClaimMessengerCapiScopeCacheRefreshInput = WorkspaceIntegrationRef & {
  capiScopeCheckedAt: Date
  expectedCapiScopeCheckedAt: Date | null
}

type UpdateDatasetIdIfNullInput = WorkspaceIntegrationRef & {
  datasetId: string
}

type UpdateCapiTestEventCodeInput = WorkspaceIntegrationRef & {
  capiTestEventCode: string | null
}

type UpdateCapiAccessTokenInput = WorkspaceIntegrationRef & {
  capiAccessToken: EncryptedData
}

const workspaceIntegrationFilter = (input: WorkspaceIntegrationRef) =>
  and(
    eq(integrationMessengerModel.id, input.id),
    eq(integrationMessengerModel.workspaceId, input.workspaceId),
  )

const capiScopeCasFilter = (
  input: WorkspaceIntegrationRef & { expectedCapiScopeCheckedAt: Date | null },
) =>
  and(
    workspaceIntegrationFilter(input),
    sql`${integrationMessengerModel.capiScopeCheckedAt} IS NOT DISTINCT FROM ${input.expectedCapiScopeCheckedAt}`,
  )

export const integrationMessengerRepository = {
  /**
   * Lists the workspace's connected Messenger Pages — used by the messaging-
   * ads wizard's WhatsApp step to let the user pick which Page supplies
   * `promoted_object.page_id` (`IntegrationWhatsapp` has no `pageId` column
   * of its own; see `packages/business/src/messaging-ads/resolve-channel-
   * assets.ts`).
   */
  listByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<Pick<IntegrationMessengerModel, "id" | "name" | "pageId">[]> {
    return tx
      .select({
        id: integrationMessengerModel.id,
        name: integrationMessengerModel.name,
        pageId: integrationMessengerModel.pageId,
      })
      .from(integrationMessengerModel)
      .where(eq(integrationMessengerModel.workspaceId, workspaceId))
      .orderBy(integrationMessengerModel.createdAt)
  },

  async findWorkspaceIntegration(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .select()
      .from(integrationMessengerModel)
      .where(workspaceIntegrationFilter(input))
      .limit(1)

    return row ?? null
  },

  /**
   * Messenger counterpart to
   * `integrationWhatsappRepository.findWorkspaceIntegrationByInboxId` (Phase
   * 3 channel-aware ads-conversion gate call sites): resolves the Messenger
   * integration that owns a given `Inbox.id`.
   */
  async findWorkspaceIntegrationByInboxId(
    input: { workspaceId: string; inboxId: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string } | null> {
    const [row] = await tx
      .select({ id: integrationMessengerModel.id })
      .from(integrationMessengerModel)
      .where(
        and(
          eq(integrationMessengerModel.inboxId, input.inboxId),
          eq(integrationMessengerModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  async updateCapiScopeCache(
    input: UpdateMessengerCapiScopeCacheInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({
        hasCapiScope: input.hasCapiScope,
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(capiScopeCasFilter(input))
      .returning()

    return row ?? this.findWorkspaceIntegration(input, tx)
  },

  async claimCapiScopeCacheRefresh(
    input: ClaimMessengerCapiScopeCacheRefreshInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({
        capiScopeCheckedAt: input.capiScopeCheckedAt,
      })
      .where(capiScopeCasFilter(input))
      .returning()

    return row ?? null
  },

  async updateDatasetIdIfNull(
    input: UpdateDatasetIdIfNullInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ datasetId: input.datasetId })
      .where(
        and(
          workspaceIntegrationFilter(input),
          isNull(integrationMessengerModel.datasetId),
        ),
      )
      .returning()

    return row ?? null
  },

  async updateDatasetId(
    input: UpdateDatasetIdIfNullInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ datasetId: input.datasetId })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },
  async updateCapiTestEventCode(
    input: UpdateCapiTestEventCodeInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ capiTestEventCode: input.capiTestEventCode })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async updateCapiAccessToken(
    input: UpdateCapiAccessTokenInput,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ capiAccessToken: input.capiAccessToken })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async connectCustomCapi(
    input: WorkspaceIntegrationRef & {
      datasetId: string
      capiAccessToken: EncryptedData
    },
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({
        datasetId: input.datasetId,
        capiAccessToken: input.capiAccessToken,
        capiDisconnectedAt: null,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async setCapiDisconnectedAt(
    input: WorkspaceIntegrationRef & { capiDisconnectedAt: Date },
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({
        capiDisconnectedAt: input.capiDisconnectedAt,
        capiAccessToken: null,
      })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async clearCapiDisconnectedAt(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ capiDisconnectedAt: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  async clearCapiAccessToken(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel | null> {
    const [row] = await tx
      .update(integrationMessengerModel)
      .set({ capiAccessToken: null })
      .where(workspaceIntegrationFilter(input))
      .returning()

    return row ?? null
  },

  /**
   * Resolves a message template to clone, scoped to the source integration AND
   * the caller's workspace via the `integrationMessenger` relation — a
   * template id from another workspace must never be readable here.
   */
  async findMessageTemplateForClone(
    input: {
      workspaceId: string
      integrationMessengerId: string
      templateId: string
    },
    tx: DatabaseClient = db,
  ): Promise<MessengerMessageTemplateModel | null> {
    const row = await tx.query.messengerMessageTemplateModel.findFirst({
      where: {
        id: input.templateId,
        integrationMessengerId: input.integrationMessengerId,
        integrationMessenger: {
          workspaceId: input.workspaceId,
        },
      },
    })

    return row ?? null
  },

  async findPageIdById(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ): Promise<{ pageId: string } | null> {
    const row = await tx.query.integrationMessengerModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
      columns: { pageId: true },
    })

    return row ?? null
  },

  /**
   * Cross-workspace by design — clone targets may live in other workspaces;
   * the caller authorises per target via workspace-owner membership.
   */
  listByIds(
    input: { ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel[]> {
    if (input.ids.length === 0) {
      return Promise.resolve([])
    }
    return tx
      .select()
      .from(integrationMessengerModel)
      .where(inArray(integrationMessengerModel.id, input.ids))
  },

  async deleteMessageTemplate(
    input: { integrationMessengerId: string; templateId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(messengerMessageTemplateModel)
      .where(
        and(
          eq(messengerMessageTemplateModel.id, input.templateId),
          eq(
            messengerMessageTemplateModel.integrationMessengerId,
            input.integrationMessengerId,
          ),
        ),
      )
  },

  listForWorkspace(
    input: { workspaceId: string; id?: string },
    tx: DatabaseClient = db,
  ): Promise<IntegrationMessengerModel[]> {
    return tx.query.integrationMessengerModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.id ? { id: input.id } : {}),
      },
      orderBy: { createdAt: "asc" },
    })
  },

  async deleteById(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(integrationMessengerModel)
      .where(eq(integrationMessengerModel.id, input.id))
  },
}
