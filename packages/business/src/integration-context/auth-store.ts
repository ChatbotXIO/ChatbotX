import { db, eq, sql } from "@chatbotx.io/database/client"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import { inboxModel } from "@chatbotx.io/database/schema"
import { distributedLock } from "@chatbotx.io/redis"
import {
  AuthException,
  type AuthStore,
  type AuthValue,
  type ConnectionHealth,
  SdkException,
} from "@chatbotx.io/sdk"
import { connectionStateService } from "../connection/state-service"
import { workspaceMemberService } from "../workspace-member/service"

const REFRESH_LOCK_TIMEOUT_SECONDS = 10

const channelToIntegrationTable = (channel: string): string => {
  const integrationName = channel
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")
  return `Integration${integrationName}`
}

/**
 * Minimal shape required to build an {@link AuthStore}: a row from any
 * `Integration<Channel>` table. `id` is required (used to load/save/lock);
 * `inboxId` is optional and only used by `markOffline`, since workspace-level
 * integrations (e.g. Google Sheets) are not inbox-bound.
 */
export type AuthStoreIntegrationRow = {
  id: string
  inboxId?: string | null
  integrationId?: string | null
}

/**
 * Build an {@link AuthStore} bound to an EXPLICIT table name — the shared
 * implementation behind {@link makeAuthStore}. Exposed directly for auth
 * tables that don't follow the `Integration<Channel>` naming convention
 * `makeAuthStore` derives (e.g. `MessagingAdsConnection`, which is keyed to a
 * channel integration but is not itself an `Integration<Channel>` row) —
 * see `buildMessagingAdsContext` in
 * `@chatbotx.io/business/messaging-ads-connection`, added per
 * out/plan/ctwa-ctm-ctid-box-merge.md v3 correction #4 ("Auth-store
 * coupling"): passing a `MessagingAdsConnection` row through `makeAuthStore`
 * would read/write the WRONG table (`channelToIntegrationTable` would derive
 * `IntegrationMessagingAdsConnection`, which does not exist).
 */
export const makeAuthStoreForTable = <TAuth extends AuthValue = AuthValue>(
  tableName: string,
  lockKeyPrefix: string,
  integration: AuthStoreIntegrationRow,
): AuthStore<TAuth> => {
  const lockKey = `auth:refresh:${lockKeyPrefix}:${integration.id}`
  /**
   * Resolves the `Connection` row mirroring this `Integration<Channel>` (or
   * workspace-integration satellite) row, so `markOffline`/`recordHealth`
   * can route through `connectionStateService` instead of writing `Inbox`
   * directly. Returns `undefined` for a row predating the Phase 1 backfill
   * — callers fall back to the legacy direct write in that case.
   */
  const resolveConnection = async () => {
    if (integration.inboxId) {
      return await connectionRepository.findByInboxId({
        inboxId: integration.inboxId,
      })
    }
    if (integration.integrationId) {
      return await connectionRepository.findByIntegrationId({
        integrationId: integration.integrationId,
      })
    }
    return
  }

  return {
    load: async () => {
      const result = await db.execute<{ auth: TAuth }>(
        sql`SELECT auth FROM ${sql.identifier(tableName)} WHERE "id" = ${integration.id} LIMIT 1`,
      )
      if (!result.rows[0]) {
        throw new SdkException(
          `Unable to load auth for ${lockKeyPrefix} integration ${integration.id}`,
        )
      }
      return result.rows[0].auth
    },
    save: async (auth: TAuth) => {
      await db.execute(
        sql`UPDATE ${sql.identifier(tableName)} SET auth = ${JSON.stringify(auth)}::jsonb WHERE "id" = ${integration.id}`,
      )
      const connection = await resolveConnection()
      if (!connection) {
        // Pre-backfill fallback: no `Connection` row to mirror onto yet.
        return
      }
      const authExpiresAt =
        auth.authType === "oauth2" && auth.tokens.expiresAt
          ? new Date(auth.tokens.expiresAt)
          : null
      await connectionStateService.recordAuthSaved({
        connectionId: connection.id,
        authExpiresAt,
      })
    },
    withLock: (fn) =>
      distributedLock.runExclusive({
        key: lockKey,
        timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
        fn,
      }),
    markOffline: async (reason?: unknown) => {
      const connection = await resolveConnection()
      const isRevoked = reason instanceof AuthException
      if (connection) {
        const ownerId =
          await workspaceMemberService.findOwnerUserIdByWorkspaceId({
            workspaceId: connection.workspaceId,
          })
        if (isRevoked) {
          await connectionStateService.markUnhealthy({
            connectionId: connection.id,
            ownerId,
          })
          return
        }
        // Transient failure (network/5xx, retries exhausted) — degrade
        // instead of revoking: the channel keeps sending and its quota slot
        // stays held, matching a live provider outage rather than a real
        // reauth requirement. Invalid from a terminal status (e.g. already
        // `needs_reauth`) is a legitimate no-op, not an error.
        try {
          await connectionStateService.transition({
            connectionId: connection.id,
            event: "refresh.transient_failure",
            reason: "refresh_failed",
            ownerId,
          })
        } catch {
          // Not currently active — nothing to degrade.
        }
        return
      }
      // Pre-backfill fallback: no `Connection` row exists yet for this
      // integration — fall back to the legacy direct `Inbox` write. Only for
      // a genuine revocation; a transient failure with no `Connection` row
      // to degrade must not disconnect the channel outright.
      if (!(isRevoked && integration.inboxId)) {
        return
      }
      await db
        .update(inboxModel)
        .set({ status: "disconnected" })
        .where(eq(inboxModel.id, integration.inboxId))
    },
    recordHealth: async (health: ConnectionHealth) => {
      const connection = await resolveConnection()
      if (!connection) {
        // Pre-backfill fallback: nothing to mirror the health check onto yet.
        return
      }
      if (health.ok) {
        await connectionStateService.transition({
          connectionId: connection.id,
          event: "verify.ok",
        })
        return
      }
      const ownerId = await workspaceMemberService.findOwnerUserIdByWorkspaceId(
        { workspaceId: connection.workspaceId },
      )
      if (health.revoked) {
        await connectionStateService.markUnhealthy({
          connectionId: connection.id,
          reason: "token_revoked",
          ownerId,
        })
        return
      }
      await connectionStateService.transition({
        connectionId: connection.id,
        event: "verify.failed_non_auth",
        reason: "verify_failed",
        ownerId,
      })
    },
  }
}

/**
 * Build an {@link AuthStore} bound to a specific `Integration<Channel>` row.
 * The store reads/writes the row's `auth` column, serializes concurrent
 * refreshes via the shared distributed lock, and (for inbox-bound channels)
 * flips `Inbox.status` to `disconnected` when refresh terminally fails.
 */
export const makeAuthStore = <TAuth extends AuthValue = AuthValue>(
  channel: string,
  integration: AuthStoreIntegrationRow,
): AuthStore<TAuth> => {
  const integrationTable = channelToIntegrationTable(channel)
  return makeAuthStoreForTable<TAuth>(integrationTable, channel, integration)
}
