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
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { flowService } from "../flow/service"
import { isWorkspaceAdminMember } from "../workspace-member/predicates"
import { workspaceMemberService } from "../workspace-member/service"

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

  /**
   * Seeds the row's own `persistentMenus` column with a single branding
   * entry after the live Graph API push succeeds — restores the v1.11.0
   * insert-time-seeded value (dropped when Messenger moved onto the unified
   * connect session, whose `candidateToConfig` has no app-layer branding
   * context to seed it at insert time). Callers gate this to rows that
   * don't already have user-configured menu items, so it never clobbers.
   */
  async seedPersistentMenu(props: {
    id: string
    entry: MessengerPersistentMenu
  }): Promise<void> {
    await db
      .update(integrationMessengerModel)
      .set({ persistentMenus: [props.entry] })
      .where(eq(integrationMessengerModel.id, props.id))
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

  /** One bounded keyset page of connected Pages; see the repository method. */
  listConnectedForWebhookSubscription(input: {
    afterId?: string
    limit: number
  }) {
    return integrationMessengerRepository.listConnectedForWebhookSubscription(
      input,
    )
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

  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationMessengerModel.findMany({
      where: { workspaceId },
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
   * Sets (or clears) the flow started when a partner hands a conversation back.
   * The flow must be an active flow of the same workspace. There is no cache to
   * invalidate: the worker reads the integration row uncached.
   */
  async updateHandoverResumeFlow(input: {
    id: string
    workspaceId: string
    handoverResumeFlowId: string | null
  }): Promise<void> {
    const { id, workspaceId, handoverResumeFlowId } = input
    if (handoverResumeFlowId) {
      const flow = await flowService.findActiveById({
        id: handoverResumeFlowId,
        workspaceId,
      })
      if (!flow) {
        throw notFoundException("Handover flow not found")
      }
    }
    const row = await integrationMessengerRepository.updateHandoverResumeFlow({
      id,
      workspaceId,
      handoverResumeFlowId,
    })
    if (!row) {
      throw notFoundException("Messenger integration not found")
    }
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
