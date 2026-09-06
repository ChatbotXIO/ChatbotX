import { db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { integrationZaloModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

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
}

export const zaloIntegrationService = new ZaloIntegrationService()
