import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  CONNECTION_TO_INBOX_DISCONNECT_REASON,
  type ConnectionStatus,
  type ConnectionStatusReason,
  type IntegrationType,
} from "@chatbotx.io/database/partials"
import {
  type ConnectionListInput,
  connectionRepository,
} from "@chatbotx.io/database/repositories"
import { inboxModel } from "@chatbotx.io/database/schema"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { logger } from "../logger"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { workspaceUsageService } from "../workspace-usage/service"
import { type ConnectionEvent, transitionConnection } from "./state"

class ConnectionNotFoundException extends Error {
  constructor(id: string) {
    super(`Connection ${id} not found`)
    this.name = "ConnectionNotFoundException"
  }
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
      values: { displayName: input.displayName },
    })
  }

  async listDueForRefresh(input: {
    before: Date
    statuses: ConnectionStatus[]
  }): Promise<ConnectionModel[]> {
    return await connectionRepository.listDueForRefresh(input)
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
    tx?: DatabaseClient
  }): Promise<ConnectionModel> {
    const client = input.tx ?? db
    const existing = await connectionRepository.findById(
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

    const updated = await connectionRepository.update(
      {
        id: existing.id,
        values: {
          status: result.to,
          statusReason: result.reason,
          connectedAt:
            result.quotaEdge === "consume" ? new Date() : existing.connectedAt,
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
        to: result.to,
        reason: result.reason,
        tx: client,
      })
    }

    // Gated on `kind === "channel"` here (not just `input.ownerId` being
    // set) as defense-in-depth: the "channels" quota metric only applies to
    // channel connections, so a caller that mistakenly resolves and passes
    // an `ownerId` for a workspace-integration/sub-connection row (AI
    // providers, marketing tools) still cannot mis-consume/release a
    // channel-quota slot.
    if (result.quotaEdge && input.ownerId && existing.kind === "channel") {
      await this.applyQuotaEdge(
        result.quotaEdge,
        input.ownerId,
        existing.workspaceId,
      )
    }

    return updated
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
    return await this.markUnhealthy({
      connectionId: existing.id,
      reason: input.reason,
      ownerId: input.ownerId,
    })
  }

  /** Records a successful `AuthStore.save` — clears any error, refreshes `authExpiresAt`, transitions back to `connected` if currently `degraded`. */
  async recordAuthSaved(input: {
    connectionId: string
    authExpiresAt?: Date | null
    tx?: DatabaseClient
  }): Promise<ConnectionModel> {
    const client = input.tx ?? db
    await connectionRepository.update(
      {
        id: input.connectionId,
        values: { authExpiresAt: input.authExpiresAt ?? null, lastError: null },
      },
      client,
    )
    return await this.transition({
      connectionId: input.connectionId,
      event: "auth.saved",
      tx: client,
    })
  }

  private async mirrorInboxStatus(input: {
    inboxId: string
    to: ConnectionStatus
    reason: ConnectionStatusReason | null
    tx: DatabaseClient
  }): Promise<void> {
    const isActive = input.to === "connected" || input.to === "degraded"
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
      .where(eq(inboxModel.id, input.inboxId))
  }

  /**
   * Consumes/releases exactly one unit of the owner's `channels` enforcement
   * quota, then best-effort mirrors the SAME edge onto the workspace's
   * display-only `channels` usage counter — the counterpart to
   * `inboxService.create`'s `!skipQuota` branch and `inboxService
   * .disconnect`'s unconditional decrement, both of which this method's
   * callers (`connectCandidate`/`connectFromCredentials`'s revive path via
   * `skipQuota: true`, and disconnect via `mirrorInboxStatus` instead of
   * `inboxService.disconnect`) deliberately bypass so this is the only
   * place either counter moves for a Connection-domain channel.
   */
  private async applyQuotaEdge(
    edge: "consume" | "release",
    ownerId: string,
    workspaceId: string,
  ): Promise<void> {
    if (edge === "consume") {
      const consumed = await quotaEnforcementService.tryConsume({
        userId: ownerId,
        metric: "channels",
      })
      if (!consumed.ok) {
        // The caller already committed the status write; a failed consume
        // here means the FSM and the quota ledger disagree. Surface it
        // rather than silently under-counting — the nightly reconcile
        // (Phase 4) is the long-term fix for this race.
        throw new Error(
          `connection quota consume failed for owner ${ownerId} after status transition committed`,
        )
      }
      await workspaceUsageService
        .increment(workspaceId, "channels")
        .catch((err) => {
          logger.warn(
            { err, workspaceId, ownerId },
            "connection connect: workspace usage channel increment failed",
          )
        })
      return
    }
    await quotaEnforcementService.release({
      userId: ownerId,
      metric: "channels",
    })
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
