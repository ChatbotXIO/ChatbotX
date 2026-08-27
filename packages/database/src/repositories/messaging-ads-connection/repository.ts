import { and, type DatabaseClient, db, eq } from "../../client"
import type { MessagingAdChannel } from "../../partials/messaging-ad"
import type { MessagingAdsConnectionStatus } from "../../partials/messaging-ads-connection"
import { messagingAdsConnectionModel } from "../../schema"
import type { MessagingAdsConnectionModel } from "../../types"

/**
 * At most one of these three is set on any real call — the caller resolves
 * `channel` -> the matching FK field (`perChannelIntegrationIdsOrNull` in
 * `@chatbotx.io/business/ads-conversion/channel-fields`, the same helper
 * `messagingAdOperationRepository` callers use). The DB CHECK constraint
 * guarantees a stored row never has more than one set; `workspaceId` is
 * REQUIRED on every lookup — the integration FK alone does not prove the
 * connection belongs to the caller's workspace (no DB-level composite FK for
 * that), see AGENTS.md invariant on `MessagingAdOperation`'s equivalent gap.
 */
type WorkspaceIntegrationFkRef = {
  workspaceId: string
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
  integrationInstagramId?: string | null
}

type CreateMessagingAdsConnectionInput = WorkspaceIntegrationFkRef & {
  id: string
  channel: MessagingAdChannel
  auth: unknown
}

type WorkspaceConnectionRef = {
  id: string
  workspaceId: string
}

type WorkspaceChannelRef = {
  workspaceId: string
  channel: MessagingAdChannel
}

export const messagingAdsConnectionRepository = {
  async findForIntegration(
    input: WorkspaceIntegrationFkRef,
    tx: DatabaseClient = db,
  ): Promise<MessagingAdsConnectionModel | null> {
    const row = await tx.query.messagingAdsConnectionModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        ...(input.integrationWhatsappId
          ? { integrationWhatsappId: input.integrationWhatsappId }
          : {}),
        ...(input.integrationMessengerId
          ? { integrationMessengerId: input.integrationMessengerId }
          : {}),
        ...(input.integrationInstagramId
          ? { integrationInstagramId: input.integrationInstagramId }
          : {}),
      },
    })
    return row ?? null
  },

  /**
   * Every `MessagingAdsConnection` row of one channel, workspace-scoped — the
   * per-channel union source for the Ads dashboard's ad-account filter/spend
   * fan-out (`resolveChannelAdAccountSources` in
   * `apps/builder/src/features/ads/queries/channel-ad-accounts.ts`). Only
   * `active` rows are returned: an `invalid` row (a prior Graph 190, or an
   * undecryptable auth blob — see `buildMessagingAdsContext`) cannot build a
   * box context, so including it here would just re-fail downstream on every
   * call.
   */
  async listForChannel(
    input: WorkspaceChannelRef,
    tx: DatabaseClient = db,
  ): Promise<MessagingAdsConnectionModel[]> {
    return await tx.query.messagingAdsConnectionModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        channel: input.channel,
        status: "active",
      },
    })
  },

  async create(
    input: CreateMessagingAdsConnectionInput,
    tx: DatabaseClient = db,
  ): Promise<MessagingAdsConnectionModel> {
    const [row] = await tx
      .insert(messagingAdsConnectionModel)
      .values({
        id: input.id,
        workspaceId: input.workspaceId,
        channel: input.channel,
        integrationWhatsappId: input.integrationWhatsappId ?? null,
        integrationMessengerId: input.integrationMessengerId ?? null,
        integrationInstagramId: input.integrationInstagramId ?? null,
        auth: input.auth,
        status: "active",
      })
      .returning()
    if (!row) {
      throw new Error("Failed to create MessagingAdsConnection")
    }
    return row
  },

  /** Reconnect: replaces the stored token and clears any `invalid` status left by a prior Graph 190 error. */
  async updateAuth(
    input: WorkspaceConnectionRef & { auth: unknown },
    tx: DatabaseClient = db,
  ): Promise<MessagingAdsConnectionModel | null> {
    const [row] = await tx
      .update(messagingAdsConnectionModel)
      .set({ auth: input.auth, status: "active" })
      .where(
        and(
          eq(messagingAdsConnectionModel.id, input.id),
          eq(messagingAdsConnectionModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row ?? null
  },

  async updateStatus(
    input: WorkspaceIntegrationFkRef & { status: MessagingAdsConnectionStatus },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const existing = await this.findForIntegration(input, tx)
    if (!existing) {
      return
    }
    await tx
      .update(messagingAdsConnectionModel)
      .set({ status: input.status })
      .where(eq(messagingAdsConnectionModel.id, existing.id))
  },

  async remove(
    input: WorkspaceConnectionRef,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(messagingAdsConnectionModel)
      .where(
        and(
          eq(messagingAdsConnectionModel.id, input.id),
          eq(messagingAdsConnectionModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
