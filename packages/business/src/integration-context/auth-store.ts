import { db, eq, sql } from "@chatbotx.io/database/client"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import { inboxModel } from "@chatbotx.io/database/schema"
import { distributedLock } from "@chatbotx.io/redis"
import { type AuthStore, type AuthValue, SdkException } from "@chatbotx.io/sdk"
import { authExpiresAtOf } from "../connection/auth-expiry"
import { InvalidConnectionTransitionException } from "../connection/state"
import { connectionStateService } from "../connection/state-service"
import { logger } from "../logger"
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
 * `id` is required to load and save the satellite row; `inboxId` identifies
 * inbox-bound integrations when resolving their mirrored `Connection` row.
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
  const fallbackLockKey = `auth:refresh:${lockKeyPrefix}:${integration.id}`
  /**
   * Resolves the `Connection` row mirroring this `Integration<Channel>` (or
   * workspace-integration satellite) row so state changes route through
   * `connectionStateService` instead of writing `Inbox` directly. Returns
   * `undefined` for a row predating the Phase 1 backfill.
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
      const result = await db.execute(
        sql`UPDATE ${sql.identifier(tableName)} SET auth = ${JSON.stringify(auth)}::jsonb WHERE "id" = ${integration.id}`,
      )
      if (result.rowCount === 0) {
        throw new SdkException(
          `Unable to save auth for ${lockKeyPrefix} integration ${integration.id}`,
        )
      }
      const connection = await resolveConnection()
      if (!connection) {
        // Pre-backfill fallback: no `Connection` row to mirror onto yet.
        return
      }
      const authExpiresAt = authExpiresAtOf(auth)
      // `auth.saved` only transitions a currently-ACTIVE (connected/
      // degraded) connection — it throws from `needs_reauth`/`paused`/
      // `disconnected` (see `transitionConnection`). The row write above
      // already succeeded and is the source of truth for the refreshed
      // token; a token refresh that happens to still work while the
      // `Connection` is in one of those inactive states (a stale
      // revocation, a pause mid-refresh, a disconnect race) must not fail
      // the whole refresh/send over a state-machine mirror that was never
      // going to apply anyway.
      try {
        await connectionStateService.recordAuthSaved({
          connectionId: connection.id,
          authExpiresAt,
        })
      } catch (err) {
        if (err instanceof InvalidConnectionTransitionException) {
          logger.warn(
            { err, connectionId: connection.id },
            "auth-store: recordAuthSaved could not transition an inactive connection; auth was still saved",
          )
          return
        }
        throw err
      }
    },
    withLock: async (fn) => {
      const connection = await resolveConnection()
      return await distributedLock.runExclusive({
        key: connection
          ? `auth:refresh:connection:${connection.id}`
          : fallbackLockKey,
        timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
        fn,
      })
    },
    markOffline: async () => {
      const connection = await resolveConnection()
      if (connection) {
        const ownerId =
          await workspaceMemberService.findOwnerUserIdByWorkspaceId({
            workspaceId: connection.workspaceId,
          })
        await connectionStateService.markUnhealthy({
          connectionId: connection.id,
          ownerId,
        })
        return
      }
      // Pre-backfill fallback: no `Connection` row exists yet for this
      // integration — preserve the legacy Inbox disconnect.
      if (!integration.inboxId) {
        return
      }
      await db
        .update(inboxModel)
        .set({ status: "disconnected" })
        .where(eq(inboxModel.id, integration.inboxId))
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
