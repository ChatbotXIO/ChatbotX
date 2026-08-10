import { db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { integrationTiktokModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

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
}

export const tiktokIntegrationService = new TiktokIntegrationService()
