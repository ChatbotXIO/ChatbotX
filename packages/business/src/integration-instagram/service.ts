import { accessTokenMatches } from "@chatbotx.io/database/auth-cas"
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
import { metaCapiEventRepository } from "@chatbotx.io/database/repositories"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import type { AuthValue } from "@chatbotx.io/sdk"
import { BaseService } from "../base.service"
import { coexistService } from "../coexist/service"
import { recordRefreshedAuth } from "../connection/record-refreshed-auth"
import {
  connectionStateService,
  type DisconnectTransactionScope,
} from "../connection/state-service"
import { contactScanService } from "../contact-scan/service"
import { contactSyncService } from "../contact-sync/service"
import { notFoundException } from "../errors"
import { logger } from "../logger"
import { assertReferencable } from "../template/installed-resource.service"
import { referencedParentsOf } from "../template/uninstall-references"

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
        inboxId: integrationInstagramModel.inboxId,
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
        inboxId: row.inboxId,
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
    /**
     * Stamps the row with this time instead of now: a reconnect fan-out writes
     * the authorization generation, so a newer reconnect is never mistaken for
     * an older one that happened to write later.
     */
    updatedAt?: Date
    /** Compare-and-set for the refresh cron; see `accessTokenMatches`. */
    expectedAccessToken?: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const client = props.tx ?? db
    const [row] = await client
      .update(integrationInstagramModel)
      .set({
        auth: props.auth,
        tokenRefreshError: null,
        ...(props.updatedAt ? { updatedAt: props.updatedAt } : {}),
        ...(props.name ? { name: props.name } : {}),
        ...(props.username ? { username: props.username } : {}),
        ...(props.pageId ? { pageId: props.pageId } : {}),
        ...(props.userInfo ? { userInfo: props.userInfo } : {}),
      })
      .where(
        and(
          eq(integrationInstagramModel.id, props.id),
          eq(integrationInstagramModel.workspaceId, props.workspaceId),
          props.expectedAccessToken
            ? accessTokenMatches(
                integrationInstagramModel.auth,
                props.expectedAccessToken,
              )
            : undefined,
        ),
      )
      .returning({
        igId: integrationInstagramModel.igId,
        type: integrationInstagramModel.type,
      })
    if (!row) {
      if (props.expectedAccessToken) {
        return false
      }
      throw notFoundException("Instagram integration not found")
    }
    await recordRefreshedAuth({
      workspaceId: props.workspaceId,
      provider: row.type === "facebook" ? "instagramFacebook" : "instagram",
      sourceId: row.igId,
      auth: props.auth as AuthValue,
      tx: props.tx,
    })
    return true
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
    props: { id: string; workspaceId: string },
    data: Record<string, unknown>,
    tx: DatabaseClient,
  ) {
    // Every flow the settings point at (welcome flow, menu buttons, ice
    // breakers): their tpl-res locks are held until the reference commits, so
    // an uninstall that tombstoned one is seen (write refused) or sees it.
    const flowIds = new Set<string>()
    if (typeof data.welcomeFlowId === "string") {
      flowIds.add(data.welcomeFlowId)
    }
    for (const parent of referencedParentsOf({
      persistentMenus: data.persistentMenus,
      conversationStarters: data.conversationStarters,
    })) {
      if (parent.kind === "flow") {
        flowIds.add(parent.resourceId)
      }
    }
    await assertReferencable({
      workspaceId: props.workspaceId,
      parents: [...flowIds].map((resourceId) => ({
        kind: "flow" as const,
        resourceId,
      })),
      tx,
    })
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

  /**
   * Removes an Instagram channel locally: ends its contact import, coexist
   * history and contact scan, deletes the row and disconnects the inbox, all in
   * one transaction. The `channels` quota unit is released after the commit
   * (or handed to the caller's `pendingRelease` when it supplies `tx`).
   */
  async disconnectChannel(props: {
    integration: { id: string; inboxId: string }
    workspaceId: string
    ownerId: string
    tx?: DatabaseClient
    pendingRelease?: DisconnectTransactionScope["pendingRelease"]
  }): Promise<void> {
    const { integration, workspaceId, ownerId } = props

    await connectionStateService.runDisconnectInTransaction(
      props,
      async (tx, pendingRelease) => {
        // The page's open contact-import items end and its owed history sync is
        // cancelled, so a reconnect never starts one unasked (the integration
        // row is locked first, the order a handoff takes it in).
        await contactSyncService.cancelForInbox(
          {
            workspaceId,
            inboxId: integration.inboxId,
            lock: { channel: "instagram", integrationId: integration.id },
          },
          tx,
        )

        // Both Instagram variants run coexist history (the Facebook-linked one
        // too, which a contacts import hands off to), so neither is skipped.
        await coexistService.tearDownForIntegration({
          workspaceId,
          integrationId: integration.id,
          channel: "instagram",
          currentError: "Integration disconnected",
          tx,
        })

        // The contact scan supports both Instagram variants too.
        await contactScanService.cancelForIntegration({
          channel: "instagram",
          integrationId: integration.id,
          tx,
        })
        // Polymorphic FK cleanup: stale MetaCapiEvent rows would keep occupying
        // the (workspaceId, channel, sourceKey) dedup slot after a reconnect.
        await metaCapiEventRepository.deleteByIntegration(
          { workspaceId, channel: "instagram", integrationId: integration.id },
          tx,
        )

        await this.disconnect({ id: integration.id, tx })

        await connectionStateService.disconnectInbox({
          inboxId: integration.inboxId,
          ownerId,
          workspaceId,
          tx,
          pendingRelease,
        })
      },
    )
  }
}

export const instagramIntegrationService = new InstagramIntegrationService()
