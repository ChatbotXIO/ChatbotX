import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  sql,
} from "@chatbotx.io/database/client"
import type {
  InstagramPersistentMenu,
  IntegrationUserInfo,
} from "@chatbotx.io/database/partials"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import type { AuthValue } from "@chatbotx.io/sdk"
import { BaseService } from "../base.service"
import { recordRefreshedAuth } from "../connection/record-refreshed-auth"
import { connectionStateService } from "../connection/state-service"
import { notFoundException } from "../errors"
import { logger } from "../logger"

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

  async markTokenRefreshError(props: {
    id: string
    workspaceId: string
    error: string
    isRevoked: boolean
  }): Promise<void> {
    const [row] = await db
      .update(integrationInstagramModel)
      .set({ tokenRefreshError: props.error })
      .where(
        and(
          eq(integrationInstagramModel.id, props.id),
          eq(integrationInstagramModel.workspaceId, props.workspaceId),
        ),
      )
      .returning({
        igId: integrationInstagramModel.igId,
        type: integrationInstagramModel.type,
      })

    if (!row) {
      logger.warn(
        { integrationId: props.id, workspaceId: props.workspaceId },
        "Unable to mark Instagram token refresh error: integration not found",
      )
      return
    }

    const provider = row.type === "facebook" ? "instagramFacebook" : "instagram"

    if (props.isRevoked) {
      await connectionStateService.markUnhealthyByIdentifier({
        provider,
        identifier: row.igId,
        workspaceId: props.workspaceId,
        reason: "token_revoked",
      })
      return
    }

    await connectionStateService.markDegradedByIdentifier({
      provider,
      identifier: row.igId,
      workspaceId: props.workspaceId,
      reason: "refresh_failed",
    })
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
    tx?: DatabaseClient
  }): Promise<void> {
    const client = props.tx ?? db
    const [row] = await client
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
      .returning({
        igId: integrationInstagramModel.igId,
        type: integrationInstagramModel.type,
      })
    if (!row) {
      throw notFoundException("Instagram integration not found")
    }
    await recordRefreshedAuth({
      workspaceId: props.workspaceId,
      provider: row.type === "facebook" ? "instagramFacebook" : "instagram",
      sourceId: row.igId,
      auth: props.auth as AuthValue,
      tx: props.tx,
    })
  }

  /**
   * Seeds the row's own `persistentMenus` column with a single branding
   * entry after the live Graph API push succeeds, same as Messenger's
   * `seedPersistentMenu`. Callers gate this to rows that don't already have
   * user-configured menu items, so it never clobbers.
   */
  async seedPersistentMenu(props: {
    id: string
    entry: InstagramPersistentMenu
  }): Promise<void> {
    await db
      .update(integrationInstagramModel)
      .set({ persistentMenus: [props.entry] })
      .where(eq(integrationInstagramModel.id, props.id))
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

  listByWorkspaceId(workspaceId: string) {
    return db.query.integrationInstagramModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    })
  }

  async updateProfileFields(
    props: { id: string },
    data: Record<string, unknown>,
    tx: DatabaseClient,
  ) {
    await tx
      .update(integrationInstagramModel)
      .set(data)
      .where(eq(integrationInstagramModel.id, props.id))
  }

  async disconnect(props: { id: string; tx: DatabaseClient }) {
    await props.tx
      .delete(integrationInstagramModel)
      .where(eq(integrationInstagramModel.id, props.id))
  }
}

export const instagramIntegrationService = new InstagramIntegrationService()
