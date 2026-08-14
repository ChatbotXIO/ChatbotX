import { and, db, eq, findOrFail, sql } from "@chatbotx.io/database/client"
import type { IntegrationUserInfo } from "@chatbotx.io/database/partials"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

class InstagramIntegrationService extends BaseService {
  findByInboxId(inboxId: string) {
    return findOrFail({ table: integrationInstagramModel, where: { inboxId } })
  }

  findByInboxIdForWorkspace(props: { inboxId: string; workspaceId: string }) {
    return findOrFail({
      table: integrationInstagramModel,
      where: { inboxId: props.inboxId, workspaceId: props.workspaceId },
    })
  }

  /**
   * Standalone Instagram Business Login rows (`type: "instagram"`) eligible for
   * the daily `ig_refresh_token` cron.
   */
  findForTokenRefresh() {
    return db.query.integrationInstagramModel.findMany({
      where: { type: "instagram" },
      columns: { id: true, workspaceId: true, auth: true },
    })
  }

  /**
   * Facebook-login coexist rows (`type: "facebook"`) eligible for the daily
   * `fb_exchange_token` cron. These carry a Facebook Page access token, which
   * doesn't expire on a schedule but can be re-exchanged the same way Messenger
   * does to surface revocation early via `tokenRefreshError`.
   */
  findFacebookForTokenRefresh() {
    return db.query.integrationInstagramModel.findMany({
      where: { type: "facebook" },
      columns: { id: true, workspaceId: true, auth: true },
    })
  }

  findForTokenRefreshByWorkspaceIds(workspaceIds: string[]) {
    if (workspaceIds.length === 0) {
      return Promise.resolve([])
    }
    return db.query.integrationInstagramModel.findMany({
      where: { type: "instagram", workspaceId: { in: workspaceIds } },
      columns: { id: true, workspaceId: true, auth: true },
    })
  }

  findFacebookForTokenRefreshByWorkspaceIds(workspaceIds: string[]) {
    if (workspaceIds.length === 0) {
      return Promise.resolve([])
    }
    return db.query.integrationInstagramModel.findMany({
      where: { type: "facebook", workspaceId: { in: workspaceIds } },
      columns: { id: true, workspaceId: true, auth: true },
    })
  }

  async markTokenRefreshError(id: string, error: string): Promise<void> {
    await db
      .update(integrationInstagramModel)
      .set({ tokenRefreshError: error })
      .where(eq(integrationInstagramModel.id, id))
  }

  findByWorkspaceId(workspaceId: string, type?: "instagram" | "facebook") {
    return db.query.integrationInstagramModel.findMany({
      where: { workspaceId, ...(type ? { type } : {}) },
    })
  }

  findByIdForWorkspace(props: { id: string; workspaceId: string }) {
    return db.query.integrationInstagramModel.findFirst({
      where: { id: props.id, workspaceId: props.workspaceId },
    })
  }

  /**
   * Replace the stored OAuth credentials after an OAuth reconnect. Scoped by
   * workspace so a forged integration id can never touch another tenant's row.
   * `pageId` may change on the Facebook-login variant when the Instagram account
   * has been re-linked to a different page (only `igId` is unique).
   */
  async updateAuth(props: {
    id: string
    workspaceId: string
    auth: Record<string, unknown>
    name?: string
    username?: string
    pageId?: string
    userInfo?: IntegrationUserInfo
  }): Promise<void> {
    await db
      .update(integrationInstagramModel)
      .set({
        auth: props.auth,
        tokenRefreshError: null,
        ...(props.name ? { name: props.name } : {}),
        ...(props.username ? { username: props.username } : {}),
        ...(props.pageId ? { pageId: props.pageId } : {}),
        ...(props.userInfo ? { userInfo: props.userInfo } : {}),
      })
      .where(
        and(
          eq(integrationInstagramModel.id, props.id),
          eq(integrationInstagramModel.workspaceId, props.workspaceId),
        ),
      )
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
      .update(integrationInstagramModel)
      .set({ userInfo: props.userInfo })
      .where(
        and(
          eq(integrationInstagramModel.id, props.id),
          eq(integrationInstagramModel.workspaceId, props.workspaceId),
        ),
      )
  }

  /**
   * Whether an Instagram integration still exists for a Facebook page, optionally
   * scoped to a specific Meta app (`clientId`). Cross-workspace by design: a page
   * webhook subscription is global, so any surviving row must block a sibling
   * channel from unsubscribing it.
   */
  async existsForPage(props: {
    pageId: string
    clientId?: string
  }): Promise<boolean> {
    const rows = await db
      .select({ id: integrationInstagramModel.id })
      .from(integrationInstagramModel)
      .where(
        and(
          eq(integrationInstagramModel.pageId, props.pageId),
          props.clientId
            ? sql`${integrationInstagramModel.auth} ->> 'clientId' = ${props.clientId}`
            : undefined,
        ),
      )
      .limit(1)

    return rows.length > 0
  }

  existsByPageId(pageId: string): Promise<boolean> {
    return this.existsForPage({ pageId })
  }
}

export const instagramIntegrationService = new InstagramIntegrationService()
