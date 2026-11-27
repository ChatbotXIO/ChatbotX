import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type IntegrationType,
  isCoexistChannel,
  type ProviderAccountEventDetail,
  type ProviderAccountEventKind,
  type ProviderAccountTarget,
} from "@chatbotx.io/database/partials"
import { coexistService } from "../coexist/service"
import { logger } from "../logger"
import {
  PROVIDER_ACCOUNT_EVENT_STRATEGY,
  type ProviderEventOrder,
} from "./provider-account-events"
import {
  connectionStateService,
  type PendingQuotaRelease,
} from "./state-service"

/** What a provider reported about the account behind a connection. */
export type ProviderAccountEventRequest = {
  integrationType: IntegrationType
  event: ProviderAccountEventKind
  detail: ProviderAccountEventDetail
  occurredAt: Date
}

/** `legacy*`: the channel predates its `Connection` row, which has no stored event time to order against. */
export type ProviderAccountEventOutcome =
  | ProviderEventOrder
  | "legacyRevoked"
  | "legacyIgnored"

const revokedErrorText = (detail: ProviderAccountEventDetail) =>
  `Provider removed access (${detail.reason}, initiated by ${detail.initiatedBy})`

/** Thrown to roll back the transaction of an event that turned out to be stale. */
class StaleProviderEventRollback extends Error {
  constructor() {
    super("Stale provider account event")
  }
}

class ProviderAccountEventService {
  /**
   * Applies one provider account event to one channel number. A revoke also
   * stops the number's coexist sync, in the same transaction as the status
   * change, so the two can never disagree.
   */
  async applyToTarget(input: {
    request: ProviderAccountEventRequest
    target: ProviderAccountTarget
  }): Promise<ProviderAccountEventOutcome> {
    const { request, target } = input
    const { connectionId } = target

    if (!connectionId) {
      return await this.applyToLegacyTarget(input)
    }

    const revoked = request.event === "revoked"
    const pendingRelease: { current: PendingQuotaRelease | null } = {
      current: null,
    }
    const outcome = await this.runAtomically(async (tx) => {
      // Integration row first, then the connection row, as a reconnect takes
      // them (`commitReconnect`: write auth, then restore the connection). The
      // revoke and the coexist shutdown commit together or not at all, so a
      // reconnect can never land between them and have its coexist stopped.
      if (revoked) {
        await this.stopCoexistSync({ request, target, tx })
      }
      const { outcome } =
        await connectionStateService.applyProviderAccountEvent({
          connectionId,
          event: request.event,
          occurredAt: request.occurredAt,
          ownerId: target.workspaceOwnerId,
          lastError: revoked ? revokedErrorText(request.detail) : undefined,
          callerTransaction: { tx, pendingRelease },
        })
      if (outcome === "stale") {
        // A late event changed nothing: undo the shutdown done above.
        throw new StaleProviderEventRollback()
      }
      return outcome
    })
    await connectionStateService.releasePendingQuota(pendingRelease.current)
    return outcome
  }

  /** Runs `work` in one transaction; a stale event rolls it back and resolves as "stale". */
  private async runAtomically(
    work: (tx: DatabaseClient) => Promise<ProviderEventOrder>,
  ): Promise<ProviderEventOrder> {
    try {
      return await db.transaction(work)
    } catch (error) {
      if (error instanceof StaleProviderEventRollback) {
        return "stale"
      }
      throw error
    }
  }

  /**
   * Only a revoke is actionable without a `Connection`. With no stored event
   * time a late revoke that a newer reconnect superseded cannot be dropped; the
   * next token check or reconnect restores such a row. A coexist run can exist
   * without a `Connection`, so it is stopped in the same transaction.
   */
  private async applyToLegacyTarget(input: {
    request: ProviderAccountEventRequest
    target: ProviderAccountTarget
  }): Promise<ProviderAccountEventOutcome> {
    const { request, target } = input
    if (request.event !== "revoked") {
      logger.warn(
        { event: request.event, inboxId: target.inboxId },
        "Provider account event skipped: no Connection row for a legacy channel",
      )
      return "legacyIgnored"
    }
    await db.transaction(async (tx) => {
      await this.stopCoexistSync({ request, target, tx })
      await connectionStateService.markLegacyInboxUnhealthy({
        inboxId: target.inboxId,
        workspaceId: target.workspaceId,
        reason: PROVIDER_ACCOUNT_EVENT_STRATEGY.revoked.reason,
        tx,
      })
    })
    return "legacyRevoked"
  }

  /**
   * A revoked account can no longer be synced: turns coexist off and fails its
   * live runs, for channels that have it. Failing the runs alone is not enough:
   * with coexist still enabled the stranded-run recovery would start another.
   */
  private async stopCoexistSync(input: {
    request: ProviderAccountEventRequest
    target: ProviderAccountTarget
    tx?: DatabaseClient
  }): Promise<void> {
    const { request, target, tx } = input
    if (!isCoexistChannel(request.integrationType)) {
      return
    }
    await coexistService.disable({
      workspaceId: target.workspaceId,
      integrationId: target.integrationId,
      channel: request.integrationType,
      currentError: revokedErrorText(request.detail),
      tx,
    })
  }
}

export const providerAccountEventService = new ProviderAccountEventService()
