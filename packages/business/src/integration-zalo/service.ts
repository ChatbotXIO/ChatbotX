import type { DatabaseClient } from "@chatbotx.io/database/client"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  integrationZaloModel,
  tagChannelModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationZaloModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { channelDuplicatedException } from "../errors"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"
import { tagSyncService } from "../tag/sync.service"

class ZaloIntegrationService extends BaseService {
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
          if (!insertWasCreated) {
            throw channelDuplicatedException()
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

    this.invalidateCacheTags(`workspaces:${workspaceId}#zalos`)

    // Import any tags already on the OA into local tags + mappings.
    if (connectedIntegrationId) {
      await tagSyncService.enqueueChannelScan({
        workspaceId,
        channelType: channelTypes.enum.zalo,
        integrationId: connectedIntegrationId,
      })
    }

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
        .where(eq(integrationZaloModel.id, id))
      await inboxService.disconnect({
        inboxId,
        ownerId,
        workspaceId,
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
