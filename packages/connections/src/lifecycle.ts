import {
  authExpiresAtOf,
  connectionStateService,
  InvalidConnectionTransitionException,
  isActiveConnectionStatus,
  type PendingQuotaRelease,
} from "@chatbotx.io/business/connection"
import {
  connectionInactiveException,
  connectionNotConfiguredException,
  connectionNotRefreshableException,
  notFoundException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { type DatabaseClient, db } from "@chatbotx.io/database/client"
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
 * User-initiated teardown: local state ALWAYS finalizes (FSM transition +
 * satellite row delete) regardless of provider-side disconnect/webhook-
 * unsubscribe outcome — matching v1.11.0 (a flaky/down third-party API must
 * never trap a workspace into being unable to remove a channel it no longer
 * wants). Every provider-side failure is recorded on `Connection.lastError`
 * for observability instead.
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
  let withinTransactionTeardown:
    | ((tx: DatabaseClient) => Promise<void>)
    | null = null

  if (adapter.store && foreignKey) {
    let auth: AuthValue | null = null
    try {
      auth = await adapter.store.loadAuthByForeignKey(
        foreignKey,
        connection.workspaceId,
      )
    } catch (err) {
      teardownErrors.push(
        toPublicErrorMessage(err, "Provider-side teardown failed"),
      )
      logger.error(
        { err, connectionId: connection.id, provider: connection.provider },
        "connection disconnect: failed to load auth for provider-side teardown",
      )
    }
    if (auth) {
      let skipGenericRemoteTeardown = false
      if (adapter.teardown) {
        try {
          const result = await adapter.teardown({ connection, auth })
          withinTransactionTeardown = result.withinTransaction
          skipGenericRemoteTeardown = result.skipGenericRemoteTeardown
        } catch (err) {
          teardownErrors.push(
            toPublicErrorMessage(err, "Provider-side teardown failed"),
          )
          logger.error(
            { err, connectionId: connection.id, provider: connection.provider },
            "connection disconnect: provider-specific teardown failed",
          )
        }
      }
      if (!skipGenericRemoteTeardown) {
        if (adapter.integration) {
          try {
            await adapter.integration.disconnect(auth)
          } catch (err) {
            teardownErrors.push(
              toPublicErrorMessage(err, "Provider-side teardown failed"),
            )
            logger.error(
              {
                err,
                connectionId: connection.id,
                provider: connection.provider,
              },
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
            logger.error(
              {
                err,
                connectionId: connection.id,
                provider: connection.provider,
              },
              "connection disconnect: webhook unsubscribe failed",
            )
          }
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

  const ownerId = await resolveOwnerId(connection)
  // `transition`'s "user.disconnect" edge may decide to release one unit of
  // `channels` quota — deferred here (instead of released inline by
  // `transition`) because this function's own `db.transaction` below does
  // more work (teardown, satellite-row delete) after the transition call;
  // releasing before that transaction actually commits would under-count
  // the release if a later statement in it rolled the whole thing back.
  const pendingRelease: { current: PendingQuotaRelease | null } = {
    current: null,
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const result = await connectionStateService.transition({
        connectionId: connection.id,
        event: "user.disconnect",
        ownerId,
        tx,
        pendingRelease,
      })
      if (withinTransactionTeardown) {
        await withinTransactionTeardown(tx)
      }
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
        await adapter.store.deleteRowByForeignKey(
          foreignKey,
          connection.workspaceId,
          tx,
        )
      }
      return result
    })
    // The transaction above just committed — safe to release now.
    await connectionStateService.releasePendingQuota(pendingRelease.current)
    return updated
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

  const auth = await store.loadAuthByForeignKey(
    foreignKey,
    connection.workspaceId,
  )
  const authStore: AuthStore<AuthValue> = {
    load: async () =>
      await store.loadAuthByForeignKey(foreignKey, connection.workspaceId),
    save: async (newAuth) => {
      const saved = await store.saveAuthByForeignKey(
        foreignKey,
        connection.workspaceId,
        newAuth,
      )
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
      .loadAuthByForeignKey(foreignKey, connection.workspaceId)
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
