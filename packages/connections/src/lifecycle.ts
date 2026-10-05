import {
  authExpiresAtOf,
  connectionStateService,
  InvalidConnectionTransitionException,
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
import { distributedLock } from "@chatbotx.io/redis"
import type { AuthStore, AuthValue } from "@chatbotx.io/sdk"
import {
  findOrThrow,
  resolveAdapter,
  resolveForeignKey,
  resolveOwnerId,
} from "./internal"
import { logger } from "./logger"

const REFRESH_LOCK_TIMEOUT_SECONDS = 10

const loadActiveConnectionStore = async (input: {
  connectionId: string
  workspaceId: string
}) => {
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
  return { connection, adapter, foreignKey, store: adapter.store }
}

/**
 * User-initiated teardown: provider-side disconnect and webhook unsubscribe
 * must both succeed before local auth is deleted and the FSM transitions.
 * Retaining the satellite row on an upstream failure keeps teardown retryable.
 *
 * This generic path does not port bespoke provider teardown side effects;
 * existing per-channel disconnect actions retain those responsibilities.
 */
export const disconnect = async (input: {
  connectionId: string
  workspaceId: string
}): Promise<ConnectionModel> => {
  const connection = await findOrThrow(input)
  const adapter = resolveAdapter(connection.provider)
  const foreignKey = resolveForeignKey(connection)
  const teardownErrors: string[] = []
  let teardownFailure: unknown

  if (adapter.store && foreignKey) {
    let auth: AuthValue | null = null
    try {
      auth = await adapter.store.loadAuthByForeignKey(foreignKey)
    } catch (err) {
      teardownErrors.push(
        toPublicErrorMessage(err, "Provider-side teardown failed"),
      )
      if (!adapter.provider.isRevokedTokenError?.(err)) {
        teardownFailure = err
      }
      logger.error(
        { err, connectionId: connection.id, provider: connection.provider },
        "connection disconnect: failed to load auth for provider-side teardown",
      )
    }
    if (auth) {
      if (adapter.integration) {
        try {
          await adapter.integration.disconnect(auth)
        } catch (err) {
          teardownErrors.push(
            toPublicErrorMessage(err, "Provider-side teardown failed"),
          )
          if (!adapter.provider.isRevokedTokenError?.(err)) {
            teardownFailure ??= err
          }
          logger.error(
            { err, connectionId: connection.id, provider: connection.provider },
            "connection disconnect: provider-side disconnect failed",
          )
        }
      }
      if (adapter.provider.webhook) {
        try {
          await adapter.provider.webhook.unsubscribe({ auth })
        } catch (err) {
          teardownErrors.push(
            toPublicErrorMessage(err, "Webhook unsubscribe failed"),
          )
          if (!adapter.provider.isRevokedTokenError?.(err)) {
            teardownFailure ??= err
          }
          logger.error(
            { err, connectionId: connection.id, provider: connection.provider },
            "connection disconnect: webhook unsubscribe failed",
          )
        }
      }
    } else {
      const authUnavailableError = new Error(
        "Provider authentication was unavailable for teardown",
      )
      teardownErrors.push(authUnavailableError.message)
      logger.error(
        {
          err: authUnavailableError,
          connectionId: connection.id,
          provider: connection.provider,
        },
        "connection disconnect: provider-side teardown skipped because auth is unavailable",
      )
    }
  }

  if (teardownFailure) {
    await connectionRepository
      .update({
        id: connection.id,
        workspaceId: connection.workspaceId,
        values: { lastError: teardownErrors.join("; ") },
      })
      .catch((persistErr) => {
        logger.error(
          {
            err: persistErr,
            connectionId: connection.id,
            provider: connection.provider,
          },
          "connection disconnect: failed to persist teardown error",
        )
      })
    throw teardownFailure
  }

  const ownerId = await resolveOwnerId(connection)
  try {
    return await db.transaction(async (tx) => {
      const updated = await connectionStateService.transition({
        connectionId: connection.id,
        event: "user.disconnect",
        ownerId,
        tx,
      })
      if (teardownErrors.length > 0) {
        await connectionRepository.update(
          {
            id: connection.id,
            workspaceId: connection.workspaceId,
            values: { lastError: teardownErrors.join("; ") },
          },
          tx,
        )
      }
      if (adapter.store && foreignKey) {
        await adapter.store.deleteRowByForeignKey(foreignKey, tx)
      }
      return updated
    })
  } catch (err) {
    const lastError = [
      ...teardownErrors,
      toPublicErrorMessage(err, "Local disconnect finalization failed"),
    ].join("; ")
    await connectionRepository
      .update({
        id: connection.id,
        workspaceId: connection.workspaceId,
        values: { lastError },
      })
      .catch((persistErr) => {
        logger.error(
          {
            err: persistErr,
            connectionId: connection.id,
            provider: connection.provider,
          },
          "connection disconnect: failed to persist teardown error after transaction rollback",
        )
      })
    throw err
  }
}

/** Forces `refreshAuth` regardless of expiry — `POST /v1/connections/{id}/refresh`. */
export const refresh = async (input: {
  connectionId: string
  workspaceId: string
}): Promise<ConnectionModel> => {
  const { connection, adapter, foreignKey, store } =
    await loadActiveConnectionStore(input)
  if (!adapter.integration?.refreshAuth) {
    throw connectionNotRefreshableException(connection.provider)
  }

  const auth = await store.loadAuthByForeignKey(foreignKey)
  const authStore: AuthStore<AuthValue> = {
    load: async () => await store.loadAuthByForeignKey(foreignKey),
    save: async (newAuth) => {
      const saved = await store.saveAuthByForeignKey(foreignKey, newAuth)
      if (!saved) {
        throw new Error(
          `Connection ${connection.id} auth persistence did not match a satellite row`,
        )
      }
      try {
        await connectionStateService.recordAuthSaved({
          connectionId: connection.id,
          authExpiresAt: authExpiresAtOf(newAuth),
        })
      } catch (err) {
        if (err instanceof InvalidConnectionTransitionException) {
          logger.warn(
            { err, connectionId: connection.id },
            "connection refresh: auth was saved after an inactive transition",
          )
          return
        }
        throw err
      }
    },
    withLock: (fn) =>
      distributedLock.runExclusive({
        key: `auth:refresh:connection:${connection.id}`,
        timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
        fn,
      }),
    markOffline: async () => {
      const ownerId = await resolveOwnerId(connection)
      await connectionStateService.markUnhealthy({
        connectionId: connection.id,
        ownerId,
      })
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
        internalRealtimeUrl: "",
        publicRealtimeUrl: "",
        storageUrl: "",
        getRealtimeBroadcastAuthHeaders: async () => ({}),
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
  const { connection, adapter, foreignKey, store } =
    await loadActiveConnectionStore(input)

  const [ownerId, health] = await Promise.all([
    resolveOwnerId(connection),
    store
      .loadAuthByForeignKey(foreignKey)
      .then(async (auth) => await adapter.provider.verify({ auth })),
  ])

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
