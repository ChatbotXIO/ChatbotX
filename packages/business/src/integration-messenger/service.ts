import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import {
  channelTypes,
  type IntegrationUserInfo,
  type MessengerPersistentMenu,
} from "@chatbotx.io/database/partials"
import { integrationMessengerRepository } from "@chatbotx.io/database/repositories"
import {
  integrationMessengerModel,
  tagChannelModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import {
  auditChannelConnected,
  connectChannelIntegration,
  runConnectTransaction,
} from "../inbox/connect-channel"
import { isWorkspaceAdminMember } from "../workspace-member/predicates"
import { workspaceMemberService } from "../workspace-member/service"

export type ConnectPageInput = {
  actorUserId: string
  ownerId: string
  workspaceId: string
  page: { pageId: string; pageName: string }
  auth: unknown
  persistentMenus: MessengerPersistentMenu[]
}

export type ConnectPageResult = {
  workspaceId: string
  integrationId: string
  wasCreated: boolean
  integration: IntegrationMessengerModel
}

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
  findConnectedPageIds(pageIds: string[]): Promise<Set<string>> {
    return integrationMessengerRepository.findConnectedPageIds(pageIds)
  }

  /**
   * Persists a Messenger page connect: one `db.transaction` (via
   * `connectChannelIntegration` → `integrationMessengerRepository.insert`)
   * that settles with the write — nothing after it may reject, so a
   * failing audit dispatch is logged, never thrown. Workspace is always
   * required (the OAuth callback stores it in the cookie before this runs).
   */
  async connectPage(input: ConnectPageInput): Promise<ConnectPageResult> {
    const { integration, wasCreated } = await this.insertPage(input)

    if (wasCreated) {
      await auditChannelConnected({
        channel: "messenger",
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

  private insertPage(input: ConnectPageInput): Promise<{
    integration: IntegrationMessengerModel
    wasCreated: boolean
  }> {
    return runConnectTransaction("messenger", async (tx) => {
      const { integration, wasCreated } = await connectChannelIntegration({
        tx,
        ownerId: input.ownerId,
        inboxData: {
          id: createId(),
          workspaceId: input.workspaceId,
          name: input.page.pageName,
          channel: "messenger",
          sourceId: input.page.pageId,
        },
        insertIntegration: (inboxId) =>
          integrationMessengerRepository.insert(
            {
              id: createId(),
              workspaceId: input.workspaceId,
              inboxId,
              pageId: input.page.pageId,
              auth: input.auth,
              name: input.page.pageName,
              persistentMenus: input.persistentMenus,
            },
            tx,
          ),
      })

      return { integration, wasCreated }
    })
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

  /**
   * Load by id with NO workspace scope — delegates to the repository.
   * Callers that separately have a `workspaceId` must compare it themselves
   * (see `coexist/messenger-sync.ts`'s explicit-mismatch branch); this must
   * NOT be used as a substitute for `findByIdForWorkspace`.
   */
  findById(props: { id: string }) {
    return integrationMessengerRepository.findById(props)
  }

  /**
   * Load by Facebook page id with NO workspace scope — for inbound webhooks
   * that have not yet resolved a workspace (e.g. inbox-label sync).
   */
  findByPageIdUnscoped(props: { pageId: string }) {
    return integrationMessengerRepository.findByPageIdUnscoped(props)
  }

  listByWorkspaceIdOrId(
    where: Partial<Pick<IntegrationMessengerModel, "id" | "workspaceId">>,
  ) {
    return db.query.integrationMessengerModel.findMany({
      where,
      orderBy: { createdAt: "asc" },
    })
  }

  async updateTagSync(props: {
    workspaceId: string
    integrationId: string
    enabled: boolean
  }): Promise<Date | null> {
    const updated = await db
      .update(integrationMessengerModel)
      .set({ syncTagEnabledAt: props.enabled ? new Date() : null })
      .where(
        and(
          eq(integrationMessengerModel.id, props.integrationId),
          eq(integrationMessengerModel.workspaceId, props.workspaceId),
        ),
      )
      .returning({
        syncTagEnabledAt: integrationMessengerModel.syncTagEnabledAt,
      })

    if (updated.length === 0) {
      throw notFoundException("Messenger channel not found")
    }

    await this.invalidateCacheTags(`workspaces:${props.workspaceId}#messengers`)

    return updated[0].syncTagEnabledAt
  }

  async updateProfileFields(
    props: { id: string },
    data: Record<string, unknown>,
    tx: DatabaseClient,
  ) {
    await tx
      .update(integrationMessengerModel)
      .set(data)
      .where(eq(integrationMessengerModel.id, props.id))
  }

  /**
   * Every Messenger page the user may clone a template onto: the pages of
   * all workspaces where the user is an admin (owner or `superAdmin`),
   * minus the source Facebook Page itself — it may be connected in more than
   * one workspace, so the exclusion is by `pageId`, not by integration id.
   * The same list feeds the picker and authorizes the clone action; the
   * action passes `authoritative` so a just-revoked membership can never be
   * served from cache across a workspace boundary.
   */
  async listCloneTargetsForUser(input: {
    userId: string
    excludePageId?: string | null
    /** Read memberships uncached — required whenever the list authorizes a write. */
    authoritative?: boolean
  }): Promise<IntegrationMessengerModel[]> {
    const members = input.authoritative
      ? await workspaceMemberService.listByUserIdUncached({
          userId: input.userId,
        })
      : await workspaceMemberService.listByUserId({ userId: input.userId })
    const adminWorkspaceIds = Array.from(
      new Set(
        members
          .filter(isWorkspaceAdminMember)
          .map((member) => member.workspaceId),
      ),
    )
    if (adminWorkspaceIds.length === 0) {
      return []
    }

    return await db.query.integrationMessengerModel.findMany({
      where: {
        workspaceId: { in: adminWorkspaceIds },
        pageId: input.excludePageId ? { ne: input.excludePageId } : undefined,
      },
      orderBy: { name: "asc" },
    })
  }

  /**
   * Deletes the integration row and its polymorphic TagChannel entries within
   * the caller's transaction. Coexist teardown, remote unsubscribe, and inbox
   * disconnect stay orchestrated by the caller.
   */
  async disconnect(props: { id: string; tx: DatabaseClient }) {
    await props.tx
      .delete(tagChannelModel)
      .where(
        and(
          eq(tagChannelModel.channelType, channelTypes.enum.messenger),
          eq(tagChannelModel.integrationId, props.id),
        ),
      )
    await props.tx
      .delete(integrationMessengerModel)
      .where(eq(integrationMessengerModel.id, props.id))
  }
}

export const messengerIntegrationService = new MessengerIntegrationService()
