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
import { integrationInstagramRepository } from "@chatbotx.io/database/repositories"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import {
  auditChannelConnected,
  connectChannelIntegration,
  runConnectTransaction,
} from "../inbox/connect-channel"

export type ConnectInstagramAccountInput = {
  actorUserId: string
  ownerId: string
  workspaceId: string
  type: IntegrationInstagramModel["type"]
  account: {
    igId: string
    igName: string
    igUsername: string
    pageId: string
  }
  auth: unknown
  persistentMenus: InstagramPersistentMenu[]
}

export type ConnectInstagramAccountResult = {
  workspaceId: string
  integrationId: string
  wasCreated: boolean
  integration: IntegrationInstagramModel
}

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

  /**
   * Instagram ids from the given list that already have an integration.
   * `IntegrationInstagram.igId` is unique platform-wide, so a match means
   * the account cannot be connected again anywhere.
   */
  findConnectedIgIds(igIds: string[]): Promise<Set<string>> {
    return integrationInstagramRepository.findConnectedIgIds(igIds)
  }

  /**
   * Persists an Instagram account connect (native login or Facebook-linked
   * — both share this table/method, `type` disambiguates the row). One
   * `db.transaction` that settles with the write; nothing after it may
   * reject, so a failing audit dispatch is logged, never thrown. Workspace
   * is always required (the OAuth callback stores it in the cookie before
   * this runs).
   */
  async connectAccount(
    input: ConnectInstagramAccountInput,
  ): Promise<ConnectInstagramAccountResult> {
    const { integration, wasCreated } = await this.insertAccount(input)

    if (wasCreated) {
      await auditChannelConnected({
        channel: "instagram",
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        integrationId: integration.id,
      })
    }

    return {
      workspaceId: input.workspaceId,
      integrationId: integration.id,
      wasCreated,
      integration,
    }
  }

  private insertAccount(input: ConnectInstagramAccountInput): Promise<{
    integration: IntegrationInstagramModel
    wasCreated: boolean
  }> {
    return runConnectTransaction("instagram", async (tx) => {
      const { integration, wasCreated } = await connectChannelIntegration({
        tx,
        ownerId: input.ownerId,
        inboxData: {
          id: createId(),
          workspaceId: input.workspaceId,
          name: input.account.igName,
          channel: "instagram",
          sourceId: input.account.igId,
        },
        insertIntegration: (inboxId) =>
          integrationInstagramRepository.insert(
            {
              id: createId(),
              workspaceId: input.workspaceId,
              inboxId,
              igId: input.account.igId,
              pageId: input.account.pageId,
              auth: input.auth,
              name: input.account.igName,
              username: input.account.igUsername,
              type: input.type,
              persistentMenus: input.persistentMenus,
            },
            tx,
          ),
      })

      return { integration, wasCreated }
    })
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
