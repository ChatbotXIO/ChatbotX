import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { integrationTiktokModel } from "@chatbotx.io/database/schema"
import type { IntegrationTiktokModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { connectChannelIntegration } from "../inbox/connect-channel"
import { inboxService } from "../inbox/service"

class TiktokIntegrationService extends BaseService {
  findById(props: { id: string; workspaceId: string }) {
    return findOrFail({
      table: integrationTiktokModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Integration TikTok not found",
    })
  }

  findAll() {
    return db
      .select({
        id: integrationTiktokModel.id,
        workspaceId: integrationTiktokModel.workspaceId,
        auth: integrationTiktokModel.auth,
      })
      .from(integrationTiktokModel)
  }

  findAllByWorkspaceIds(workspaceIds: string[]) {
    if (workspaceIds.length === 0) {
      return Promise.resolve([])
    }
    return db
      .select({
        id: integrationTiktokModel.id,
        workspaceId: integrationTiktokModel.workspaceId,
        auth: integrationTiktokModel.auth,
      })
      .from(integrationTiktokModel)
      .where(inArray(integrationTiktokModel.workspaceId, workspaceIds))
  }

  async updateAuth(id: string, auth: Record<string, unknown>): Promise<void> {
    await db
      .update(integrationTiktokModel)
      .set({ auth, tokenRefreshError: null })
      .where(eq(integrationTiktokModel.id, id))
  }

  async markTokenRefreshError(id: string, error: string): Promise<void> {
    await db
      .update(integrationTiktokModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationTiktokModel.id, id))
  }

  async listByWorkspace(
    where: Partial<Pick<IntegrationTiktokModel, "workspaceId">>,
  ): Promise<IntegrationTiktokModel[]> {
    return await db.query.integrationTiktokModel.findMany({
      where,
      orderBy: {
        createdAt: "asc",
      },
    })
  }

  async findByOpenId(openId: string): Promise<IntegrationTiktokModel | null> {
    return (
      (await db.query.integrationTiktokModel.findFirst({
        where: { openId },
      })) ?? null
    )
  }

  async connect(input: {
    workspaceId: string
    ownerId: string
    openId: string
    username: string
    displayName: string
    auth: Record<string, unknown>
  }): Promise<{
    wasCreated: boolean
    integration: { id: string } | undefined
  }> {
    const { workspaceId, ownerId, openId, username, displayName, auth } = input
    const integrationId = createId()

    const { wasCreated, integration } = await db.transaction(async (tx) =>
      connectChannelIntegration({
        tx,
        ownerId,
        inboxData: {
          workspaceId,
          name: displayName,
          channel: "tiktok",
          sourceId: username,
        },
        insertIntegration: async (inboxId) => {
          const [row] = await tx
            .insert(integrationTiktokModel)
            .values({
              id: integrationId,
              inboxId,
              workspaceId,
              openId,
              name: displayName,
              auth,
            })
            .onConflictDoUpdate({
              target: [integrationTiktokModel.openId],
              set: {
                auth,
                name: displayName,
                tokenRefreshError: null,
              },
            })
            .returning({ id: integrationTiktokModel.id })

          return row
        },
      }),
    )

    return { wasCreated, integration }
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
      await client
        .delete(integrationTiktokModel)
        .where(eq(integrationTiktokModel.id, id))
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

export const tiktokIntegrationService = new TiktokIntegrationService()
