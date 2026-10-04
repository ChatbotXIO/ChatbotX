import { and, type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
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
} from "@chatbotx.io/database/repositories"
import { type connectionModel, inboxModel } from "@chatbotx.io/database/schema"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { channelLimitReachedException } from "../errors"
import { inboxService } from "../inbox/service"
import { logger } from "../logger"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceUsageService } from "../workspace-usage/service"
import {
  type ConnectionEvent,
  isActiveConnectionStatus,
  transitionConnection,
} from "./state"

class ConnectionNotFoundException extends Error {
  constructor(id: string) {
    super(`Connection ${id} not found`)
    this.name = "ConnectionNotFoundException"
  }
}

export type ConnectionQuotaConsumption = {
  consumed: boolean
  workspaceId?: string
  workspaceUsageIncremented: boolean
}

/**
 * DB-backed reads/writes over the `Connection` table plus its `Inbox`
 * legacy-status mirror. Deliberately **registry-free** — it never imports
 * `@chatbotx.io/connections` — so it stays safe to call from `markOffline`
 * hooks and webhook handlers that must not pull in the full provider
 * registry's module graph. The registry-aware orchestration (provider
 * `disconnect`/`webhook.unsubscribe` calls, store-binding CRUD) lives in
 * `ConnectionService` (Phase 2), which calls this service for the state
 * transition itself.
 *
 * Deferred to Phase 2 (not yet wired here): `Integration<Channel>.tokenRefreshError`,
 * `FacebookAds.status`, `MetaCatalog.status` legacy mirrors, and the
 * `dashboardEventBus.emit("connection:changed")` notification — both need
 * either registry lookups or new event-schema registration this pass keeps
 * out of scope. `Inbox.status`/`disconnectReason` (the mirror the trial-expiry
 * banner and every existing channel-status read already depends on) is wired.
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
   * Applies one FSM event to an existing `Connection` row: computes the next
   * status via the pure `transitionConnection` (`./state.ts`), writes it,
   * mirrors `Inbox.status`/`disconnectReason` when the connection is
   * inbox-bound, and — on the state machine's `quotaEdge` — consumes or
   * releases exactly one unit of the caller-supplied quota owner's
   * `channels` metric. Best-effort: a quota-release failure never rolls back
   * the status write (the nightly reconcile self-heals), matching
   * `inboxService.disconnect`'s existing behavior.
   */
  async transition(input: {
    connectionId: string
    event: ConnectionEvent
    reason?: ConnectionStatusReason
    /** Required when the event can consume/release quota (all except read-only transitions). */
    ownerId?: string
    values?: Pick<
      typeof connectionModel.$inferInsert,
      "authExpiresAt" | "lastError"
    >
    tx?: DatabaseClient
    /** Required for a quota-consuming transition inside a caller-owned transaction. */
    quotaConsumption?: ConnectionQuotaConsumption
  }): Promise<ConnectionModel> {
    const quotaConsumption = input.quotaConsumption ?? {
      consumed: false,
      workspaceUsageIncremented: false,
    }
    const run = async (client: DatabaseClient): Promise<ConnectionModel> => {
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
        if (!input.values) {
          return existing
        }
        const updated = await connectionRepository.update(
          {
            id: existing.id,
            workspaceId: existing.workspaceId,
            values: input.values,
          },
          client,
        )
        if (!updated) {
          throw new ConnectionNotFoundException(input.connectionId)
        }
        return updated
      }

      const consumesQuota =
        result.quotaEdge === "consume" && existing.kind === "channel"
      const releasesQuota =
        result.quotaEdge === "release" && existing.kind === "channel"
      if ((consumesQuota || releasesQuota) && !input.ownerId) {
        throw new Error(
          `connection ${existing.id} transition "${input.event}" would ${result.quotaEdge} channel quota but no ownerId was supplied`,
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
        quotaConsumption.consumed = true
        quotaConsumption.workspaceId = existing.workspaceId
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
              result.quotaEdge === "release"
                ? new Date()
                : existing.disconnectedAt,
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

      if (consumesQuota && input.ownerId) {
        try {
          await workspaceUsageService.increment(
            existing.workspaceId,
            "channels",
          )
          quotaConsumption.workspaceUsageIncremented = true
        } catch (err) {
          logger.warn(
            {
              err,
              workspaceId: existing.workspaceId,
              ownerId: input.ownerId,
            },
            "connection connect: workspace usage channel increment failed",
          )
        }
      } else if (releasesQuota && input.ownerId) {
        await this.releaseQuotaEdge(input.ownerId, existing.workspaceId)
      }

      return updated
    }

    try {
      if (input.tx) {
        return await run(input.tx)
      }
      return await db.transaction(run)
    } catch (err) {
      if (
        quotaConsumption.consumed &&
        input.ownerId &&
        quotaConsumption.workspaceId
      ) {
        await this.releaseQuotaEdge(
          input.ownerId,
          quotaConsumption.workspaceId,
          quotaConsumption.workspaceUsageIncremented,
        )
        quotaConsumption.consumed = false
        quotaConsumption.workspaceId = undefined
        quotaConsumption.workspaceUsageIncremented = false
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
   * Same as `markUnhealthy`, resolved by `(provider, sourceId)` instead of a
   * known `Connection.id` — the shape a provider webhook payload (TikTok
   * `authorization.removed`'s `openId`, etc.) actually carries. Silently
   * no-ops when no matching connection exists (an orphaned/duplicate webhook
   * delivery, not a caller error).
   */
  async markUnhealthyByIdentifier(input: {
    provider: IntegrationType
    identifier: string
    reason?: ConnectionStatusReason
    ownerId?: string
  }): Promise<ConnectionModel | null> {
    const existing =
      await connectionRepository.findByProviderAndSourceIdAnyWorkspace({
        provider: input.provider,
        sourceId: input.identifier,
      })
    if (!existing) {
      return null
    }
    if (!isActiveConnectionStatus(existing.status)) {
      // No ACTIVE row matched `(provider, identifier)` — the repository
      // fell back to its "any row, most recent" branch, which can be a
      // stale disconnected row (possibly from a DIFFERENT workspace that
      // reconnected the same external account elsewhere). Proceeding is
      // still the best available option (a webhook payload carries no
      // workspace to disambiguate further), but this is worth a warning —
      // see I8 in the PR review.
      logger.warn(
        {
          provider: input.provider,
          identifier: input.identifier,
          connectionId: existing.id,
          status: existing.status,
        },
        "markUnhealthyByIdentifier: no ACTIVE connection matched; falling back to the most recent non-active row",
      )
    }
    return await this.markUnhealthy({
      connectionId: existing.id,
      reason: input.reason,
      ownerId: input.ownerId,
    })
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
    await input.tx
      .update(inboxModel)
      .set(
        isActive
          ? {
              status: "connected",
              disconnectedAt: null,
              disconnectReason: null,
            }
          : {
              status: "disconnected",
              disconnectedAt: new Date(),
              disconnectReason: input.reason
                ? CONNECTION_TO_INBOX_DISCONNECT_REASON[input.reason]
                : "manual",
            },
      )
      .where(
        and(
          eq(inboxModel.id, input.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
        ),
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
   * release, which never blocks/rolls back an already-inactive connection)
   * — this is the release-only counterpart, the same "only place either
   * counter moves for a Connection-domain channel" as before.
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
