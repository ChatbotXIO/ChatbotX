import { auditService } from "@chatbotx.io/business/audit"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { distributedLock } from "@chatbotx.io/redis"
import type { ErrorLogProvider } from "@chatbotx.io/utils/error-log"
import { logger } from "../../lib/logger"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"

export const REFRESH_SOURCE = "schedule:refreshChannelTokens"

export async function runRefreshBatch<T>(
  items: T[],
  refreshOne: (item: T) => Promise<void>,
  batchSize: number,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await Promise.allSettled(batch.map(refreshOne))
  }
}

export type RefreshWithErrorHandlingInput<TAuth> = {
  id: string
  workspaceId: string
  provider: ErrorLogProvider
  label: string
  lockKey: string
  lockTimeout: number
  // Runs the refresh under a lock the caller provides instead of `lockKey` —
  // for channels whose SDK refresh takes the auth store's lock, which every
  // other refresh path must share (TikTok rotates refresh tokens).
  withLock?: (fn: () => Promise<void>) => Promise<void>
  // Performs the lookup and the provider's refresh call. Return `undefined`
  // to skip this integration silently (no audit record, no error).
  refresh: () => Promise<TAuth | undefined>
  // Persists the refreshed auth returned by `refresh`. Return `false` when the
  // write was skipped because a reconnect replaced the auth meanwhile: nothing
  // was refreshed, so no audit record is written.
  apply: (newAuth: TAuth) => Promise<unknown>
  markError: (error: unknown) => Promise<void>
  auditDetail: string
  // Invoked when `distributedLock.runExclusive` itself rejects (e.g. a
  // failed lock acquisition), instead of letting it reject the batch.
  onLockError?: (error: unknown) => Promise<void> | void
}

export async function refreshWithErrorHandling<TAuth>(
  input: RefreshWithErrorHandlingInput<TAuth>,
): Promise<void> {
  const {
    id,
    workspaceId,
    provider,
    label,
    lockKey,
    lockTimeout,
    withLock,
    refresh,
    apply,
    markError,
    auditDetail,
    onLockError,
  } = input

  await runJobWithAuditContext({ workspaceId, source: REFRESH_SOURCE }, () => {
    const lock = (fn: () => Promise<void>): Promise<void> =>
      withLock
        ? withLock(fn)
        : distributedLock.runExclusive({
            key: lockKey,
            timeoutInSeconds: lockTimeout,
            fn,
          })
    const run = lock(async () => {
      try {
        const newAuth = await refresh()
        if (newAuth === undefined) {
          return
        }

        if ((await apply(newAuth)) === false) {
          return
        }

        await auditService.record({
          action: "refresh",
          detail: auditDetail,
          workspaceId,
          source: REFRESH_SOURCE,
        })
      } catch (error) {
        logger.error(
          { err: error, id, workspaceId },
          `[${label}] refresh failed`,
        )
        try {
          await markError(error)
        } catch (markErrorError) {
          logger.error(
            { err: markErrorError, id, workspaceId },
            `[${label}] markError failed`,
          )
        }
        try {
          await logProviderError({ provider, workspaceId, error })
        } catch (logProviderErrorError) {
          logger.error(
            { err: logProviderErrorError, id, workspaceId },
            `[${label}] logProviderError failed`,
          )
        }
      }
    })

    return run.catch((error) => {
      if (onLockError) {
        return onLockError(error)
      }
      logger.error(
        { err: error, id, workspaceId },
        `[${label}] lock acquisition failed`,
      )
    })
  })
}
