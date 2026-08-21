import {
  and,
  db,
  eq,
  findOrFail,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import type { IntegrationUserInfo } from "@chatbotx.io/database/partials"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

class MessengerIntegrationService extends BaseService {
  findByInboxId(inboxId: string) {
    return findOrFail({ table: integrationMessengerModel, where: { inboxId } })
  }

  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationMessengerModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }

  findByIdForWorkspace(props: { id: string; workspaceId: string }) {
    return db.query.integrationMessengerModel.findFirst({
      where: { id: props.id, workspaceId: props.workspaceId },
    })
  }

  findByPageId(props: { workspaceId: string; pageId: string }) {
    return db.query.integrationMessengerModel.findFirst({
      where: { workspaceId: props.workspaceId, pageId: props.pageId },
    })
  }

  /**
   * Replace the stored OAuth credentials after an OAuth reconnect. Scoped by
   * workspace so a forged integration id can never touch another tenant's row.
   */
  async updateAuth(props: {
    id: string
    workspaceId: string
    auth: Record<string, unknown>
    name?: string
    userInfo?: IntegrationUserInfo
  }): Promise<void> {
    await db
      .update(integrationMessengerModel)
      .set({
        auth: props.auth,
        tokenRefreshError: null,
        ...(props.name ? { name: props.name } : {}),
        ...(props.userInfo ? { userInfo: props.userInfo } : {}),
      })
      .where(
        and(
          eq(integrationMessengerModel.id, props.id),
          eq(integrationMessengerModel.workspaceId, props.workspaceId),
        ),
      )
  }

  findAllForTokenRefresh() {
    return db
      .select({
        id: integrationMessengerModel.id,
        workspaceId: integrationMessengerModel.workspaceId,
        auth: integrationMessengerModel.auth,
      })
      .from(integrationMessengerModel)
  }

  findForTokenRefreshByWorkspaceIds(workspaceIds: string[]) {
    if (workspaceIds.length === 0) {
      return Promise.resolve([])
    }
    return db
      .select({
        id: integrationMessengerModel.id,
        workspaceId: integrationMessengerModel.workspaceId,
        auth: integrationMessengerModel.auth,
      })
      .from(integrationMessengerModel)
      .where(inArray(integrationMessengerModel.workspaceId, workspaceIds))
  }

  async markTokenRefreshError(id: string, error: string): Promise<void> {
    await db
      .update(integrationMessengerModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationMessengerModel.id, id))
  }

  /**
   * Store the authorizing user's identity after a connect. Separate from the
   * insert because the avatar upload is an external call that must stay outside
   * the connect transaction.
   */
  async updateUserInfo(props: {
    id: string
    workspaceId: string
    userInfo: IntegrationUserInfo
  }): Promise<void> {
    await db
      .update(integrationMessengerModel)
      .set({ userInfo: props.userInfo })
      .where(
        and(
          eq(integrationMessengerModel.id, props.id),
          eq(integrationMessengerModel.workspaceId, props.workspaceId),
        ),
      )
  }

  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationMessengerModel.findMany({
      where: { workspaceId },
    })
  }

  /**
   * Page ids from the given list that already have a Messenger integration.
   * `IntegrationMessenger.pageId` is unique platform-wide, so a match means the
   * page cannot be connected again anywhere.
   */
  async findConnectedPageIds(pageIds: string[]): Promise<string[]> {
    if (pageIds.length === 0) {
      return []
    }

    const rows = await db
      .select({ pageId: integrationMessengerModel.pageId })
      .from(integrationMessengerModel)
      .where(inArray(integrationMessengerModel.pageId, pageIds))

    return rows.map((row) => row.pageId)
  }

  /**
   * Whether a Messenger integration still exists for a Facebook page under a
   * specific Meta app (`clientId`). Cross-workspace by design: the page webhook
   * subscription is global, so a surviving row must block a sibling channel from
   * unsubscribing it.
   */
  async existsForPage(props: {
    pageId: string
    clientId: string
  }): Promise<boolean> {
    const rows = await db
      .select({ id: integrationMessengerModel.id })
      .from(integrationMessengerModel)
      .where(
        and(
          eq(integrationMessengerModel.pageId, props.pageId),
          sql`${integrationMessengerModel.auth} ->> 'clientId' = ${props.clientId}`,
        ),
      )
      .limit(1)

    return rows.length > 0
  }
}

export const messengerIntegrationService = new MessengerIntegrationService()
