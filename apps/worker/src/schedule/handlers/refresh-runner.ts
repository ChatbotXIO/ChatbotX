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
  // Performs the lookup and the provider's refresh call. Return `undefined`
  // to skip this integration silently (no audit record, no error).
  refresh: () => Promise<TAuth | undefined>
  // Persists the refreshed auth returned by `refresh`.
  apply: (newAuth: TAuth) => Promise<void>
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
    refresh,
    apply,
    markError,
    auditDetail,
    onLockError,
  } = input

  await runJobWithAuditContext({ workspaceId, source: REFRESH_SOURCE }, () => {
    const run = distributedLock.runExclusive({
      key: lockKey,
      timeoutInSeconds: lockTimeout,
      fn: async () => {
        try {
          const newAuth = await refresh()
          if (newAuth === undefined) {
            return
          }

          await apply(newAuth)

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
      },
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
