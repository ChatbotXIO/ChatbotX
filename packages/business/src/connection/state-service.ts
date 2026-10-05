import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  CONNECTION_TO_INBOX_DISCONNECT_REASON,
  type ConnectionStatus,
  type ConnectionStatusReason,
  type IntegrationType,
} from "@chatbotx.io/database/partials"
import {
  aiHandoverBulkRunRepository,
  aiHandoverSettingsRepository,
  type ConnectionListInput,
  connectionRepository,
  inboxRepository,
} from "@chatbotx.io/database/repositories"
import type { connectionModel } from "@chatbotx.io/database/schema"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { ChatbotXException, channelLimitReachedException } from "../errors"
import { inboxService } from "../inbox/service"
import { logger } from "../logger"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceMemberService } from "../workspace-member/service"
import { workspaceUsageService } from "../workspace-usage/service"
import {
  type ConnectionEvent,
  isActiveConnectionStatus,
  transitionConnection,
} from "./state"

class ConnectionNotFoundException extends ChatbotXException {
  constructor(id: string) {
    super(`Connection ${id} not found`, "notFound", 404)
  }
}

export type ConnectionQuotaConsumption =
  | {
      consumed: false
      workspaceId?: undefined
      workspaceUsageIncremented: false
    }
  | {
      consumed: true
      workspaceId: string
      workspaceUsageIncremented: boolean
    }

/** A `channels` quota release a `transition` call decided on but has not yet executed — see `transition`'s `pendingRelease` handshake and `releasePendingQuota`. */
export type PendingQuotaRelease = { ownerId: string; workspaceId: string }

/**
 * DB-backed reads/writes over the `Connection` table plus its `Inbox`
 * legacy-status mirror. Deliberately **registry-free** — it never imports
 * `@chatbotx.io/connections` — so it stays safe to call from `markOffline`
 * hooks and webhook handlers that must not pull in the full provider
 * registry's module graph. Registry-aware orchestration (provider
 * `disconnect`/`webhook.unsubscribe` calls and store-binding CRUD) lives in
 * `ConnectionService`, which calls this service for the state transition.
 *
 * The `Inbox.status`/`disconnectReason` mirror is maintained here because
 * existing channel-status reads and the trial-expiry banner depend on it.
 * Provider-specific legacy mirrors and dashboard notifications stay owned by
 * their respective integrations and event producers.
 */
class ConnectionStateService extends BaseService {
  async list(input: ConnectionListInput) {
    const [data, count] = await Promise.all([
      connectionRepository.list(input),
      connectionRepository.count(input),
    ])
    return { data, count }
  }

  async getForWorkspace(input: {
    id: string
    workspaceId: string
  }): Promise<ConnectionModel | undefined> {
    return await connectionRepository.findByIdForWorkspace(input)
  }

  /** `PATCH /v1/connections/{id}` — the only field this route may change; provider config stays on provider-specific routes. */
  async updateDisplayName(input: {
    id: string
    workspaceId: string
    displayName: string
  }): Promise<ConnectionModel | undefined> {
    const existing = await connectionRepository.findByIdForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!existing) {
      return
    }
    return await connectionRepository.update({
      id: existing.id,
      workspaceId: existing.workspaceId,
      values: { displayName: input.displayName },
    })
  }

  /**
   * Disconnects the connection mirroring an inbox, or preserves the legacy
   * inbox-only path for rows not yet backfilled into `Connection`.
   */
  async disconnectInbox(input: {
    inboxId: string
    workspaceId: string
    ownerId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const connection = await connectionRepository.findByInboxId(
      { inboxId: input.inboxId },
      input.tx,
    )
    if (connection && connection.workspaceId !== input.workspaceId) {
      throw new ConnectionNotFoundException(input.inboxId)
    }
    if (connection) {
      await this.transition({
        connectionId: connection.id,
        event: "user.disconnect",
        ownerId: input.ownerId,
        tx: input.tx,
      })
      return
    }
    await inboxService.disconnect({
      ...input,
      reason: "manual",
    })
  }

  /**
   * Reconnect counterpart of {@link disconnectInbox}: after a reconnect
   * flow (OAuth re-authorize or re-pasted credential) saves fresh auth onto
   * the satellite row, call this to re-consume `channels` quota (the
   * `connect.completed` edge, same event a fresh connect uses) and mirror
   * `Inbox.status` back to `connected` — the FSM handles reviving from
   * `needs_reauth`/`disconnected`/`paused` alike. No-ops for a row not yet
   * backfilled into `Connection` (nothing to mirror/consume through yet);
   * the reconnect flow's own satellite write already restored its auth.
   */
  async reconnectInbox(input: {
    inboxId: string
    workspaceId: string
    authExpiresAt?: Date | null
    tx?: DatabaseClient
  }): Promise<void> {
    const connection = await connectionRepository.findByInboxId(
      { inboxId: input.inboxId },
      input.tx,
    )
    if (!connection) {
      return
    }
    if (connection.workspaceId !== input.workspaceId) {
      throw new ConnectionNotFoundException(input.inboxId)
    }
    const ownerId = await workspaceMemberService.findOwnerUserIdByWorkspaceId({
      workspaceId: input.workspaceId,
    })
    await this.transition({
      connectionId: connection.id,
      event: "connect.completed",
      ownerId,
      values: { authExpiresAt: input.authExpiresAt ?? null, lastError: null },
      tx: input.tx,
    })
  }

  /**
   * Applies one FSM event to an existing `Connection` row: computes the next
   * status via the pure `transitionConnection` (`./state.ts`), writes it,
   * mirrors `Inbox.status`/`disconnectReason` when the connection is
   * inbox-bound, and consumes one `channels` quota unit at an inactive-to-active
   * edge. A release at an active-to-inactive edge is best-effort: it is skipped
   * with a warning when no quota owner remains, and a release failure never
   * rolls back the status write (the nightly reconcile self-heals).
   */
  async transition(input: {
    connectionId: string
    event: ConnectionEvent
    reason?: ConnectionStatusReason
    /** Required for channel quota consumption; ownerless release is best-effort. */
    ownerId?: string
    values?: Pick<
      typeof connectionModel.$inferInsert,
      "authExpiresAt" | "lastError"
    >
    tx?: DatabaseClient
    /** Required for a quota-consuming transition inside a caller-owned transaction. */
    quotaConsumption?: ConnectionQuotaConsumption
    /**
     * Caller-owned-transaction opt-in for a release-edge transition: when
     * supplied alongside `tx`, a release this transition decides on is
     * stashed here instead of firing immediately — `tx`'s owner must
     * release it (via `releasePendingQuota`) only once ITS OWN transaction
     * has actually committed; otherwise a later statement in that same
     * transaction rolling back would under-count the release. Omitted →
     * this transition keeps releasing immediately once its own DB work
     * resolves, same as before this handshake existed.
     */
    pendingRelease?: { current: PendingQuotaRelease | null }
  }): Promise<ConnectionModel> {
    const quotaConsumption: ConnectionQuotaConsumption =
      input.quotaConsumption ?? {
        consumed: false,
        workspaceUsageIncremented: false,
      }
    type RunResult = {
      updated: ConnectionModel
      /** A release this transition decided on but has not yet executed — see below. */
      pendingRelease: PendingQuotaRelease | null
    }
    const run = async (client: DatabaseClient): Promise<RunResult> => {
      // Row-locked (not the relational `findById`): two concurrent
      // `transition` calls on the same connection must serialize here so
      // only one of them reads the pre-transition status and decides the
      // quota edge — otherwise both can observe the same `existing.status`
      // and each consume (or release) a `channels` quota unit for what is
      // really a single state change.
      const existing = await connectionRepository.findByIdForUpdateById(
        { id: input.connectionId },
        client,
      )
      if (!existing) {
        throw new ConnectionNotFoundException(input.connectionId)
      }

      const result = transitionConnection({
        from: existing.status,
        event: input.event,
        reason: input.reason,
      })

      if (result.noop) {
        const values = {
          ...input.values,
          ...(result.reason ? { statusReason: result.reason } : {}),
        }
        const updated =
          Object.keys(values).length === 0
            ? existing
            : await connectionRepository.update(
                {
                  id: existing.id,
                  workspaceId: existing.workspaceId,
                  values,
                },
                client,
              )
        if (!updated) {
          throw new ConnectionNotFoundException(input.connectionId)
        }
        // Even a no-op FSM event must re-assert the Inbox mirror: a row
        // whose Inbox drifted from Connection (a write that bypassed the
        // engine, or a bug fixed after the fact) self-heals the next time
        // anything transitions it, instead of staying silently wrong.
        if (existing.inboxId) {
          await this.mirrorInboxStatus({
            inboxId: existing.inboxId,
            workspaceId: existing.workspaceId,
            to: result.to,
            reason: result.reason,
            tx: client,
          })
        }
        return { updated, pendingRelease: null }
      }

      const consumesQuota =
        result.quotaEdge === "consume" && existing.kind === "channel"
      const releasesQuota =
        result.quotaEdge === "release" && existing.kind === "channel"
      if (consumesQuota && !input.ownerId) {
        throw new Error(
          `connection ${existing.id} transition "${input.event}" would consume channel quota but no ownerId was supplied`,
        )
      }
      if (consumesQuota && input.tx && !input.quotaConsumption) {
        throw new Error(
          `connection ${existing.id} consumes channel quota inside a caller-owned transaction without rollback tracking`,
        )
      }

      if (consumesQuota && input.ownerId) {
        const consumed = await quotaEnforcementService.tryConsume({
          userId: input.ownerId,
          metric: "channels",
        })
        if (!consumed.ok) {
          throw channelLimitReachedException()
        }
        Object.assign(quotaConsumption, {
          consumed: true,
          workspaceId: existing.workspaceId,
          workspaceUsageIncremented: false,
        })
      }

      const updated = await connectionRepository.update(
        {
          id: existing.id,
          workspaceId: existing.workspaceId,
          values: {
            ...input.values,
            status: result.to,
            statusReason: result.reason,
            connectedAt:
              result.quotaEdge === "consume"
                ? new Date()
                : existing.connectedAt,
            disconnectedAt:
              result.to === "disconnected"
                ? (existing.disconnectedAt ?? new Date())
                : null,
          },
        },
        client,
      )
      if (!updated) {
        throw new ConnectionNotFoundException(input.connectionId)
      }

      if (existing.inboxId) {
        await this.mirrorInboxStatus({
          inboxId: existing.inboxId,
          workspaceId: existing.workspaceId,
          to: result.to,
          reason: result.reason,
          tx: client,
        })
      }

      let pendingRelease: RunResult["pendingRelease"] = null
      if (consumesQuota && input.ownerId) {
        await workspaceUsageService.increment(existing.workspaceId, "channels")
        quotaConsumption.workspaceUsageIncremented = true
      } else if (releasesQuota) {
        if (input.ownerId) {
          // Deferred (M-8): releasing here, inside the transaction, raced a
          // COMMIT failure (or, for a caller-owned `tx`, any later statement
          // in that same transaction) rolling back this very status write
          // after the release had already fired — under-counting quota on
          // rollback. The caller below only runs this once `run` has
          // returned from an actually-committed transaction.
          pendingRelease = {
            ownerId: input.ownerId,
            workspaceId: existing.workspaceId,
          }
        } else {
          logger.warn(
            {
              connectionId: existing.id,
              event: input.event,
              workspaceId: existing.workspaceId,
            },
            "connection transition: skipped channel quota release without owner",
          )
        }
      }

      return { updated, pendingRelease }
    }

    try {
      const { updated, pendingRelease } = input.tx
        ? await run(input.tx)
        : await db.transaction(run)
      if (input.tx && input.pendingRelease) {
        // Caller-owned transaction with a deferred-release handshake: only
        // the caller knows when its own transaction actually commits, so it
        // alone decides when to release — see `releasePendingQuota`.
        input.pendingRelease.current = pendingRelease
      } else if (pendingRelease) {
        // Either the self-managed path (`db.transaction(run)` has only just
        // resolved here because Postgres committed — safe to release now),
        // or a caller-owned `tx` that didn't opt into the handshake above —
        // same immediate-release behavior as before this fix.
        await this.releaseQuotaEdge(
          pendingRelease.ownerId,
          pendingRelease.workspaceId,
        )
      }
      return updated
    } catch (err) {
      if (quotaConsumption.consumed && input.ownerId) {
        await this.releaseQuotaEdge(
          input.ownerId,
          quotaConsumption.workspaceId,
          quotaConsumption.workspaceUsageIncremented,
        )
        Object.assign(quotaConsumption, {
          consumed: false,
          workspaceId: undefined,
          workspaceUsageIncremented: false,
        })
      }
      throw err
    }
  }

  /**
   * Convenience wrapper over `transition` for the common "provider says the
   * token/account is no longer usable" path (`AuthStore.markOffline`,
   * webhook-driven revocation) — always fires `auth.revoked`.
   */
  async markUnhealthy(input: {
    connectionId: string
    reason?: ConnectionStatusReason
    ownerId?: string
    tx?: DatabaseClient
  }): Promise<ConnectionModel> {
    return await this.transition({
      connectionId: input.connectionId,
      event: "auth.revoked",
      reason: input.reason ?? "token_revoked",
      ownerId: input.ownerId,
      tx: input.tx,
    })
  }

  /** Releases a quota reservation after its caller-owned transaction rolls back. */
  async compensateQuotaConsumption(input: {
    ownerId: string
    workspaceId: string
    workspaceUsageIncremented: boolean
  }): Promise<void> {
    await this.releaseQuotaEdge(
      input.ownerId,
      input.workspaceId,
      input.workspaceUsageIncremented,
    )
  }

  /**
   * Releases a `channels` quota unit a `transition` call deferred via its
   * `pendingRelease` handshake — call only after the caller-owned
   * transaction that ran `transition` has actually committed (a later
   * rollback must never release). No-ops when nothing was deferred (the
   * transition didn't cross an active→inactive edge, or `pendingRelease`
   * wasn't supplied to it in the first place).
   */
  async releasePendingQuota(
    pendingRelease: PendingQuotaRelease | null,
  ): Promise<void> {
    if (!pendingRelease) {
      return
    }
    await this.releaseQuotaEdge(
      pendingRelease.ownerId,
      pendingRelease.workspaceId,
    )
  }

  /**
   * Shared `(provider, sourceId)` lookup behind `markUnhealthyByIdentifier`
   * and `markDegradedByIdentifier` — see the former's doc for the
   * `workspaceId`-present-vs-absent resolution difference and the
   * ambiguity warning on an any-workspace fallback.
   */
  private async findConnectionByIdentifier(input: {
    provider: IntegrationType
    identifier: string
    workspaceId?: string
  }): Promise<ConnectionModel | null> {
    const existing = input.workspaceId
      ? await connectionRepository.findByProviderSourceId({
          workspaceId: input.workspaceId,
          provider: input.provider,
          sourceId: input.identifier,
        })
      : await connectionRepository.findByProviderAndSourceIdAnyWorkspace({
          provider: input.provider,
          sourceId: input.identifier,
        })
    if (!existing) {
      return null
    }
    if (!(input.workspaceId || isActiveConnectionStatus(existing.status))) {
      // No ACTIVE row matched `(provider, identifier)` — the repository
      // fell back to its "any row, most recent" branch, which can be a
      // stale disconnected row (possibly from a DIFFERENT workspace that
      // reconnected the same external account elsewhere). Proceeding is still
      // the best available option because webhooks carry no workspace id, so
      // the warning makes the ambiguity observable.
      logger.warn(
        {
          provider: input.provider,
          identifier: input.identifier,
          connectionId: existing.id,
          status: existing.status,
        },
        "findConnectionByIdentifier: no ACTIVE connection matched; falling back to the most recent non-active row",
      )
    }
    return existing
  }

  /**
   * Same as `markUnhealthy`, resolved by `(provider, sourceId)` instead of a
   * known `Connection.id` — the shape a provider webhook payload (TikTok
   * `authorization.removed`'s `openId`, etc.) actually carries. Silently
   * no-ops when no matching connection exists (an orphaned/duplicate webhook
   * delivery, not a caller error).
   *
   * Pass `workspaceId` whenever the caller already knows it (e.g. TikTok's
   * `authorization.removed`, which carries the integration row's
   * `workspaceId`) — this resolves the exact `(workspaceId, provider,
   * sourceId)` unique row instead of the any-workspace fallback below, so a
   * different workspace's reconnected copy of the same external account can
   * never be marked unhealthy by mistake.
   */
  async markUnhealthyByIdentifier(input: {
    provider: IntegrationType
    identifier: string
    reason?: ConnectionStatusReason
    ownerId?: string
    workspaceId?: string
  }): Promise<ConnectionModel | null> {
    const existing = await this.findConnectionByIdentifier(input)
    if (!existing) {
      return null
    }
    return await this.markUnhealthy({
      connectionId: existing.id,
      reason: input.reason,
      ownerId: input.ownerId,
    })
  }

  /**
   * The transient counterpart of `markUnhealthyByIdentifier`: a token
   * refresh attempt failed without the provider confirming the token/
   * account itself was revoked (an API outage, rate limit, etc.) —
   * `refresh.transient_failure` moves an active connection to `degraded`
   * (reason defaults to `refresh_failed`) instead of `needs_reauth`,
   * leaving `channels` quota untouched (the quota edge only fires on an
   * active/inactive boundary crossing, and `degraded` is still active — see
   * `isActiveConnectionStatus`). A non-active connection is left alone (a
   * no-op, not an error): a refresh failure on an already-disconnected row
   * has nothing to degrade.
   */
  async markDegradedByIdentifier(input: {
    provider: IntegrationType
    identifier: string
    reason?: ConnectionStatusReason
    workspaceId?: string
  }): Promise<ConnectionModel | null> {
    const existing = await this.findConnectionByIdentifier(input)
    if (!(existing && isActiveConnectionStatus(existing.status))) {
      return null
    }
    return await this.transition({
      connectionId: existing.id,
      event: "refresh.transient_failure",
      reason: input.reason ?? "refresh_failed",
    })
  }

  /**
   * `markUnhealthyByIdentifier`'s counterpart for a provider whose `Inbox`
   * row predates its `Connection` backfill — no `Connection` row exists yet
   * to resolve `(provider, identifier)` against, so the caller (a webhook
   * handler that already has the legacy per-provider row, e.g.
   * `IntegrationTiktok`) passes `inboxId` directly. Mirrors `Inbox.status`
   * to `needs_reauth` the same way `transition`'s `auth.revoked` edge does
   * for a backfilled connection — deliberately NOT `inboxService.disconnect`,
   * which also releases `channels` quota: an un-backfilled row's channel
   * was never consumed through this Connection-domain `tryConsume`/
   * `release` pairing in the first place (it predates the engine), so this
   * function has no tracked unit to pair a release against here. The
   * resulting drift — the owner stays charged for a channel stuck in
   * `needs_reauth` — is corrected once the row is backfilled and
   * reconciled, not by a point release in this fallback.
   */
  async markLegacyInboxUnhealthy(input: {
    inboxId: string
    workspaceId: string
    reason?: ConnectionStatusReason
  }): Promise<void> {
    await db.transaction(async (tx) => {
      await this.mirrorInboxStatus({
        inboxId: input.inboxId,
        workspaceId: input.workspaceId,
        to: "needs_reauth",
        reason: input.reason ?? "token_revoked",
        tx,
      })
    })
  }

  /** Thin pass-through for a workspace-scoped `(provider, sourceId)` lookup — the unique-key read a caller needs before a write it drives (e.g. the legacy AI-provider disconnect alias), so app-layer code never imports `connectionRepository` directly. */
  async findByProviderSourceId(input: {
    workspaceId: string
    provider: IntegrationType
    sourceId: string
  }): Promise<ConnectionModel | undefined> {
    return await connectionRepository.findByProviderSourceId(input)
  }

  /** Every distinct provider with a non-disconnected `Connection` row in this workspace — backs the connect catalog's "already connected" check with one `SELECT DISTINCT` instead of paging through every matching row. */
  async listProvidersWithStatus(input: {
    workspaceId: string
    statuses: ConnectionStatus[]
  }): Promise<IntegrationType[]> {
    return await connectionRepository.distinctProvidersByStatus(input)
  }

  /** Records a successful `AuthStore.save` after the auth write commits. */
  async recordAuthSaved(input: {
    connectionId: string
    authExpiresAt?: Date | null
    tx?: DatabaseClient
  }): Promise<ConnectionModel> {
    return await this.transition({
      connectionId: input.connectionId,
      event: "auth.saved",
      values: {
        authExpiresAt: input.authExpiresAt ?? null,
        lastError: null,
      },
      tx: input.tx,
    })
  }

  private async mirrorInboxStatus(input: {
    inboxId: string
    workspaceId: string
    to: ConnectionStatus
    reason: ConnectionStatusReason | null
    tx: DatabaseClient
  }): Promise<void> {
    const isActive = isActiveConnectionStatus(input.to)
    await inboxRepository.updateConnectionMirror(
      {
        inboxId: input.inboxId,
        workspaceId: input.workspaceId,
        values: isActive
          ? {
              status: "connected",
              disconnectedAt: null,
              disconnectReason: null,
            }
          : {
              status: "disconnected",
              // A no-op re-assertion (`reason === null`) must preserve
              // whatever `disconnectedAt`/`disconnectReason` is already
              // stored (M-2) — only a real transition stamps fresh values.
              ...(input.reason
                ? {
                    disconnectedAt: new Date(),
                    disconnectReason:
                      CONNECTION_TO_INBOX_DISCONNECT_REASON[input.reason],
                  }
                : {}),
            },
      },
      input.tx,
    )
    if (!isActive) {
      const ref = { workspaceId: input.workspaceId, inboxId: input.inboxId }
      if (await aiHandoverSettingsRepository.lockExisting(ref, input.tx)) {
        await aiHandoverBulkRunRepository.cancelLive(ref, input.tx)
      }
    }
  }

  /**
   * Best-effort release of one unit of the owner's `channels` enforcement
   * quota, then a best-effort mirror onto the workspace's display-only
   * `channels` usage counter. Consume is handled inline in `transition`
   * (it must run BEFORE the status write and throw on failure, unlike
   * release, which never blocks/rolls back an already-inactive connection).
   * This is the release-only counterpart and the only Connection-domain
   * channel path that moves either counter.
   */
  private async releaseQuotaEdge(
    ownerId: string,
    workspaceId: string,
    decrementWorkspaceUsage = true,
  ): Promise<void> {
    // Best-effort: never block/roll back the status transition if release
    // fails — the nightly reconcile self-heals. A real Redis/DB error here
    // must not undo the status write this runs alongside in the same
    // transaction, matching `inboxService.disconnect`'s existing release
    // call.
    await quotaEnforcementService
      .release({ userId: ownerId, metric: "channels" })
      .catch((err) => {
        logger.warn(
          { err, workspaceId, ownerId },
          "connection disconnect: channel quota release failed",
        )
      })
    if (!decrementWorkspaceUsage) {
      return
    }
    await workspaceUsageService
      .decrement(workspaceId, "channels")
      .catch((err) => {
        logger.warn(
          { err, workspaceId, ownerId },
          "connection disconnect: workspace usage channel decrement failed",
        )
      })
  }
}

export const connectionStateService = new ConnectionStateService()
