import { db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { integrationZaloModel } from "@chatbotx.io/database/schema"
import type { IntegrationZaloModel } from "@chatbotx.io/database/types"
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
   * Unscoped single-row lookup by id — `sync-channel-labels.ts` / `sync-
   * tag.ts` resolve the integration first and only then know its workspace,
   * so no `workspaceId` filter is available at this call site. Distinct
   * name from `findById` above, which requires `workspaceId`.
   */
  async findByIdUnscoped(props: {
    id: string
  }): Promise<IntegrationZaloModel | null> {
    const row = await db.query.integrationZaloModel.findFirst({
      where: { id: props.id },
    })
    return row ?? null
  }

  /** `sync-tag.ts` attach path: resolve the Zalo integration owning an inbox. */
  async findByInboxId(props: { inboxId: string }) {
    const row = await db.query.integrationZaloModel.findFirst({
      where: { inboxId: props.inboxId },
    })
    return row ?? null
  }

  /** `sync-tag.ts` create path: every Zalo integration in the workspace, full rows. */
  async listByWorkspace(props: { workspaceId: string }) {
    return await db.query.integrationZaloModel.findMany({
      where: { workspaceId: props.workspaceId },
    })
  }
}

export const zaloIntegrationService = new ZaloIntegrationService()
