import { db, eq, sql } from "@chatbotx.io/database/client"
import { inboxModel } from "@chatbotx.io/database/schema"
import { distributedLock } from "@chatbotx.io/redis"
import { type AuthStore, type AuthValue, SdkException } from "@chatbotx.io/sdk"

const REFRESH_LOCK_TIMEOUT_SECONDS = 10

const channelToIntegrationTable = (channel: string): string => {
  const inboxName = channel
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
  return `Integration${inboxName}`
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
  const lockKey = `auth:refresh:${channel}:${integration.id}`

  return {
    load: async () => {
      const result = await db.execute<{ auth: TAuth }>(
        sql`SELECT auth FROM ${sql.identifier(integrationTable)} WHERE "id" = ${integration.id} LIMIT 1`,
      )
      if (!result.rows[0]) {
        throw new SdkException(
          `Unable to load auth for ${channel} integration ${integration.id}`,
        )
      }
      return result.rows[0].auth
    },
    save: async (auth: TAuth) => {
      await db.execute(
        sql`UPDATE ${sql.identifier(integrationTable)} SET auth = ${JSON.stringify(auth)}::jsonb WHERE "id" = ${integration.id}`,
      )
    },
    withLock: (fn) =>
      distributedLock.runExclusive({
        key: lockKey,
        timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
        fn,
      }),
    markOffline: async () => {
      if (!integration.inboxId) {
        // Workspace-level integration (no inbox) — nothing to disconnect.
        return
      }
      await db
        .update(inboxModel)
        .set({ status: "disconnected" })
        .where(eq(inboxModel.id, integration.inboxId))
    },
  }
}
