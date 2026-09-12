import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  integrationZaloModel,
  tagChannelModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationZaloModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"
import { logger } from "../logger"
import { tagSyncService } from "../tag/sync.service"

class ZaloIntegrationService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationZaloModel.findFirst({ where: { workspaceId } })
  }

  async updateTagSync(props: {
    workspaceId: string
    integrationId: string
    enabled: boolean
  }): Promise<Date | null> {
    const updated = await db
      .update(integrationZaloModel)
      .set({ syncTagEnabledAt: props.enabled ? new Date() : null })
      .where(
        and(
          eq(integrationZaloModel.id, props.integrationId),
          eq(integrationZaloModel.workspaceId, props.workspaceId),
        ),
      )
      .returning({ syncTagEnabledAt: integrationZaloModel.syncTagEnabledAt })

    if (updated.length === 0) {
      throw notFoundException("Zalo channel not found")
    }

    await this.invalidateCacheTags(`workspaces:${props.workspaceId}#zalos`)

    return updated[0].syncTagEnabledAt
  }
  async findAll(): Promise<
    Array<{ id: string; workspaceId: string; auth: Record<string, unknown> }>
  > {
    return await db
      .select({
        id: integrationZaloModel.id,
        workspaceId: integrationZaloModel.workspaceId,
        auth: integrationZaloModel.auth,
      })
      .from(integrationZaloModel)
  }

  async findAllByWorkspaceIds(
    workspaceIds: string[],
  ): Promise<
    Array<{ id: string; workspaceId: string; auth: Record<string, unknown> }>
  > {
    if (workspaceIds.length === 0) {
      return []
    }
    return await db
      .select({
        id: integrationZaloModel.id,
        workspaceId: integrationZaloModel.workspaceId,
        auth: integrationZaloModel.auth,
      })
      .from(integrationZaloModel)
      .where(inArray(integrationZaloModel.workspaceId, workspaceIds))
  }

  findById(props: { id: string; workspaceId: string }) {
    return findOrFail({
      table: integrationZaloModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Integration Zalo not found",
    })
  }

  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationZaloModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }

  async updateAuth(
    id: string,
    auth: Record<string, unknown>,
    name?: string,
  ): Promise<void> {
    await db
      .update(integrationZaloModel)
      .set({ auth, tokenRefreshError: null, ...(name ? { name } : {}) })
      .where(eq(integrationZaloModel.id, id))
  }

  async markTokenRefreshError(id: string, error: string): Promise<void> {
    await db
      .update(integrationZaloModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationZaloModel.id, id))
  }

  /**
   * Load a Zalo integration by OA id with NO workspace scope — used by
   * inbound webhooks (e.g. inbox-label sync) that only have the OA id and
   * have not yet resolved a workspace.
   */
  findByOaId(props: { oaId: string }) {
    return db.query.integrationZaloModel.findFirst({
      where: { oaId: props.oaId },
    })
  }

  async listByWorkspace(
    where: Partial<Pick<IntegrationZaloModel, "workspaceId" | "id">>,
  ): Promise<IntegrationZaloModel[]> {
    return await db.query.integrationZaloModel.findMany({
      where,
      orderBy: {
        createdAt: "asc",
      },
    })
  }

  async connect(input: {
    workspaceId: string
    ownerId: string
    oaId: string
    name: string
    auth: Record<string, unknown>
  }): Promise<{ integrationId: string | undefined; wasCreated: boolean }> {
    const { workspaceId, ownerId, oaId, name, auth } = input

    let connectedIntegrationId: string | undefined
    let channelWasCreated = false

    await db.transaction(async (tx) => {
      const { wasCreated } = await connectChannelIntegration({
        tx,
        ownerId,
        inboxData: {
          workspaceId,
          name,
          channel: "zalo",
          sourceId: oaId,
        },
        insertIntegration: async (inboxId, insertWasCreated) => {
          // `false` means the Inbox already existed *in this workspace* and is
          // already `connected` — the owner is re-running OAuth for their own
          // OA, not colliding with another workspace. Cross-workspace
          // duplicates are rejected earlier by `connectChannelIntegration`'s
          // `inboxService.isConnected` check, which throws
          // `channelDuplicatedException` before we get here. So skip the insert
          // and leave `connectedIntegrationId` undefined: throwing would roll
          // back the whole transaction, discarding the disconnected→connected
          // revival `inboxService.create` performs on the same path.
          if (!insertWasCreated) {
            return
          }
          const [row] = await tx
            .insert(integrationZaloModel)
            .values({
              inboxId,
              workspaceId,
              oaId,
              auth,
              name,
            })
            .returning({ id: integrationZaloModel.id })
          connectedIntegrationId = row?.id
        },
      })
      channelWasCreated = wasCreated
    })

    // Import any tags already on the OA into local tags + mappings. The row is
    // already committed, so a queue outage must not fail the connect — hence
    // the `.catch`, which also keeps the caller's audit record reachable: a
    // throw here would leave a connected channel with no audit trail.
    if (connectedIntegrationId) {
      await tagSyncService
        .enqueueChannelScan({
          workspaceId,
          channelType: channelTypes.enum.zalo,
          integrationId: connectedIntegrationId,
        })
        .catch((err) => {
          logger.warn(
            { err, workspaceId, integrationId: connectedIntegrationId },
            "zalo connect: channel tag scan enqueue failed",
          )
        })
    }

    // Last, so the cache is only dropped once every write above has settled.
    await this.invalidateCacheTags(`workspaces:${workspaceId}#zalos`)

    return {
      integrationId: connectedIntegrationId,
      wasCreated: channelWasCreated,
    }
  }

  async disconnect(input: {
    workspaceId: string
    id: string
    inboxId: string
    ownerId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, inboxId, ownerId, tx } = input

    const run = async (client: DatabaseClient) => {
      // Polymorphic FK cleanup — no DB-level cascade for TagChannel.integrationId
      await client
        .delete(tagChannelModel)
        .where(
          and(
            eq(tagChannelModel.channelType, channelTypes.enum.zalo),
            eq(tagChannelModel.integrationId, id),
          ),
        )
      await client
        .delete(integrationZaloModel)
        .where(
          and(
            eq(integrationZaloModel.id, id),
            eq(integrationZaloModel.workspaceId, workspaceId),
          ),
        )
      await inboxService.disconnect({
        inboxId,
        ownerId,
        workspaceId,
        reason: "manual",
        tx: client,
      })
    }

    if (tx) {
      await run(tx)
      return
    }
    await db.transaction(run)
  }
}

export const zaloIntegrationService = new ZaloIntegrationService()
