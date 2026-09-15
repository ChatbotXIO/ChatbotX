import {
  connectionStateService,
  isActiveConnectionStatus,
} from "@chatbotx.io/business/connection"
import {
  connectionInactiveException,
  connectionNotConfiguredException,
  connectionNotRefreshableException,
  notFoundException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import type { ConnectionModel } from "@chatbotx.io/database/types"
import type { AuthStore, AuthValue } from "@chatbotx.io/sdk"
import { AuthException } from "@chatbotx.io/sdk"
import {
  findOrThrow,
  resolveAdapter,
  resolveForeignKey,
  resolveOwnerId,
} from "./internal"
import { logger } from "./logger"

/**
 * User-initiated teardown: best-effort provider-side disconnect + webhook
 * unsubscribe (never blocks the local state transition on an upstream
 * failure), then the satellite row's own `onDisconnect` policy
 * (`delete_row`/`keep_row`), then the FSM transition.
 *
 * Scope note: this is the **generic** disconnect path shared by every
 * provider. Bespoke per-provider teardown side effects that predate the
 * Connection domain — messenger's shared-IG-page `general_info`
 * preservation, WhatsApp's coexist/staging cleanup, TikTok/Zalo specifics —
 * are NOT ported here; those remain in their existing per-channel disconnect
 * actions until a dedicated follow-up audits each one individually.
 */
export const disconnect = async (input: {
  connectionId: string
  workspaceId: string
}): Promise<ConnectionModel> => {
  const connection = await findOrThrow(input)
  const adapter = resolveAdapter(connection.provider)
  const foreignKey = resolveForeignKey(connection)
  let teardownError: string | null = null

  if (adapter.store && foreignKey) {
    try {
      const auth = await adapter.store.loadAuthByForeignKey(foreignKey)
      if (adapter.integration) {
        await adapter.integration.disconnect(auth)
      }
      if (adapter.provider.webhook) {
        await adapter.provider.webhook.unsubscribe({ auth })
      }
    } catch (err) {
      // Surfaced onto the row (not just logged) — a webhook left
      // subscribed or a provider-side disconnect that silently failed is
      // otherwise indistinguishable from a clean teardown once the row
      // flips to `disconnected`.
      teardownError = toPublicErrorMessage(err, "Provider-side teardown failed")
      logger.warn(
        { err, connectionId: connection.id, provider: connection.provider },
        "connection disconnect: provider-side teardown failed, proceeding with local disconnect",
      )
    }
  }

  const ownerId = await resolveOwnerId(connection)
  // `deleteRowByForeignKey` and the FSM transition share one transaction:
  // if the satellite delete throws, the whole disconnect rolls back
  // instead of leaving the Connection row `connected` with its satellite
  // row already gone.
  return await db.transaction(async (tx) => {
    if (adapter.store && foreignKey) {
      await adapter.store.deleteRowByForeignKey(foreignKey, tx)
    }
    if (teardownError) {
      await connectionRepository.update(
        { id: connection.id, values: { lastError: teardownError } },
        tx,
      )
    }
    return await connectionStateService.transition({
      connectionId: connection.id,
      event: "user.disconnect",
      ownerId,
      tx,
    })
  })
}

/** Forces `refreshAuth` regardless of expiry — `POST /v1/connections/{id}/refresh`. */
export const refresh = async (input: {
  connectionId: string
  workspaceId: string
}): Promise<ConnectionModel> => {
  const connection = await findOrThrow(input)
  if (!isActiveConnectionStatus(connection.status)) {
    throw connectionInactiveException()
  }
  const adapter = resolveAdapter(connection.provider)
  if (!adapter.integration?.refreshAuth) {
    throw connectionNotRefreshableException(connection.provider)
  }
  if (!adapter.store) {
    throw connectionNotConfiguredException(connection.provider)
  }
  const foreignKey = resolveForeignKey(connection)
  if (!foreignKey) {
    throw connectionNotConfiguredException(connection.provider)
  }
  const store = adapter.store

  const auth = await store.loadAuthByForeignKey(foreignKey)
  const authStore: AuthStore<AuthValue> = {
    load: async () => await store.loadAuthByForeignKey(foreignKey),
    save: async (newAuth) => {
      await store.saveAuthByForeignKey(foreignKey, newAuth)
      const authExpiresAt =
        newAuth.authType === "oauth2" && newAuth.tokens.expiresAt
          ? new Date(newAuth.tokens.expiresAt)
          : null
      await connectionStateService.recordAuthSaved({
        connectionId: connection.id,
        authExpiresAt,
      })
    },
    markOffline: async (reason?: unknown) => {
      const ownerId = await resolveOwnerId(connection)
      if (reason instanceof AuthException) {
        await connectionStateService.markUnhealthy({
          connectionId: connection.id,
          ownerId,
        })
        return
      }
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
    },
  }

  // `refreshAuth`/`ensureFreshAuth` only ever read `ctx.auth`/`ctx.authStore`
  // (never `ctx.platform`/`ctx.storagePrefix`/`ctx.integrationDetail`) —
  // see `Integration.refreshAndPersist` in `@chatbotx.io/sdk`. The
  // `platform` stub below is structurally required but never invoked on
  // this path.
  await adapter.integration.ensureFreshAuth(
    {
      storagePrefix: "",
      auth,
      authStore,
      platform: {
        appUrl: "",
        wsUrl: "",
        storageUrl: "",
        getRealtimeAuthHeaders: async () => ({}),
      },
    },
    { force: true },
  )

  const refreshed = await connectionRepository.findById({ id: connection.id })
  if (!refreshed) {
    throw notFoundException("Connection not found")
  }
  return refreshed
}

/** Live health check without a refresh cycle — `POST /v1/connections/{id}/verify`. */
export const verify = async (input: {
  connectionId: string
  workspaceId: string
}): Promise<ConnectionModel> => {
  const connection = await findOrThrow(input)
  if (!isActiveConnectionStatus(connection.status)) {
    throw connectionInactiveException()
  }
  const adapter = resolveAdapter(connection.provider)
  if (!adapter.store) {
    throw connectionNotConfiguredException(connection.provider)
  }
  const foreignKey = resolveForeignKey(connection)
  if (!foreignKey) {
    throw connectionNotConfiguredException(connection.provider)
  }

  const auth = await adapter.store.loadAuthByForeignKey(foreignKey)
  const health = await adapter.provider.verify({ auth })
  const ownerId = await resolveOwnerId(connection)

  if (health.ok) {
    return await connectionStateService.transition({
      connectionId: connection.id,
      event: "verify.ok",
      ownerId,
    })
  }
  if (health.revoked) {
    return await connectionStateService.markUnhealthy({
      connectionId: connection.id,
      reason: "token_revoked",
      ownerId,
    })
  }
  return await connectionStateService.transition({
    connectionId: connection.id,
    event: "verify.failed_non_auth",
    reason: "verify_failed",
    ownerId,
  })
}
