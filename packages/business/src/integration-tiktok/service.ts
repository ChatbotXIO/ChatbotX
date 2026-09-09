import {
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
} from "@chatbotx.io/database/client"
import { integrationTiktokModel } from "@chatbotx.io/database/schema"
import type { IntegrationTiktokModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { connectChannelIntegration } from "../inbox/connect-channel"

export type ConnectTiktokInput = {
  tx: DatabaseClient
  ownerId: string
  workspaceId: string
  openId: string
  username: string
  displayName: string
  auth: Record<string, unknown>
}

class TiktokIntegrationService extends BaseService {
  findById(props: { id: string; workspaceId: string }) {
    return findOrFail({
      table: integrationTiktokModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Integration TikTok not found",
    })
  }

  listByWorkspaceId(
    where: Partial<Pick<IntegrationTiktokModel, "workspaceId">>,
  ) {
    return db.query.integrationTiktokModel.findMany({
      where,
      orderBy: { createdAt: "asc" },
    })
  }

  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationTiktokModel.findFirst({ where: { workspaceId } })
  }

  findByOpenId(openId: string) {
    return db.query.integrationTiktokModel.findFirst({ where: { openId } })
  }

  async connect(input: ConnectTiktokInput) {
    const integrationId = createId()

    return await connectChannelIntegration({
      tx: input.tx,
      ownerId: input.ownerId,
      inboxData: {
        workspaceId: input.workspaceId,
        name: input.displayName,
        channel: "tiktok",
        sourceId: input.username,
      },
      insertIntegration: async (inboxId) => {
        const [integration] = await input.tx
          .insert(integrationTiktokModel)
          .values({
            id: integrationId,
            inboxId,
            workspaceId: input.workspaceId,
            openId: input.openId,
            name: input.displayName,
            auth: input.auth,
          })
          .onConflictDoUpdate({
            target: [integrationTiktokModel.openId],
            set: {
              auth: input.auth,
              name: input.displayName,
              tokenRefreshError: null,
            },
          })
          .returning({ id: integrationTiktokModel.id })

        return integration
      },
    })
  }

  async disconnect(props: { id: string; tx: DatabaseClient }) {
    await props.tx
      .delete(integrationTiktokModel)
      .where(eq(integrationTiktokModel.id, props.id))
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
}

export const tiktokIntegrationService = new TiktokIntegrationService()
