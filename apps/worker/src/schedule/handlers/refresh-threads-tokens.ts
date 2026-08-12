import {
  integrationThreadsService,
  THREADS_TOKEN_REFRESH_THRESHOLD_DAYS,
} from "@chatbotx.io/business"
import {
  refreshAccessToken,
  type ThreadsAuthValue,
} from "@chatbotx.io/integration-threads"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock } from "@chatbotx.io/redis"

const log = getChildLogger("refresh-threads-tokens")
const LOCK_TTL_SECONDS = 30 * 60
const DAY_IN_MS = 24 * 60 * 60 * 1000

const toSafeErrorContext = (error: unknown) => {
  const safeError: {
    errorName: string
    errorCode?: string | number
    errorStatus?: number
  } = {
    errorName: error instanceof Error ? error.name : "UnknownError",
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (typeof error.code === "string" || typeof error.code === "number")
  ) {
    safeError.errorCode = error.code
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    safeError.errorStatus = error.status
  }

  return safeError
}

export async function refreshThreadsTokens(): Promise<void> {
  await distributedLock.runExclusive({
    key: "schedule:refresh-threads-tokens",
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const refreshBefore = new Date(
        Date.now() + THREADS_TOKEN_REFRESH_THRESHOLD_DAYS * DAY_IN_MS,
      )
      const integrations =
        await integrationThreadsService.listDueForTokenRefresh({
          refreshBefore,
        })

      log.info(
        { count: integrations.length },
        "refreshThreadsTokens: due integrations loaded",
      )

      for (const integration of integrations) {
        try {
          const refreshed = await refreshAccessToken({
            accessToken: integration.currentAccessToken,
          })
          const auth = integration.auth as ThreadsAuthValue
          const updated =
            await integrationThreadsService.updateAuthIfAccessTokenMatches({
              id: integration.id,
              workspaceId: integration.workspaceId,
              expectedCurrentAccessToken: integration.currentAccessToken,
              auth: {
                ...auth,
                tokens: {
                  ...auth.tokens,
                  accessToken: refreshed.accessToken,
                  expiresAt: refreshed.expiresAt ?? auth.tokens.expiresAt,
                },
              },
            })

          if (updated) {
            log.info(
              {
                integrationId: integration.id,
                workspaceId: integration.workspaceId,
              },
              "refreshThreadsTokens: integration refreshed",
            )
            continue
          }

          log.info(
            {
              integrationId: integration.id,
              workspaceId: integration.workspaceId,
            },
            "refreshThreadsTokens: skipped stale integration",
          )
        } catch (error) {
          log.error(
            {
              ...toSafeErrorContext(error),
              integrationId: integration.id,
              workspaceId: integration.workspaceId,
            },
            "refreshThreadsTokens: integration refresh failed",
          )
        }
      }
    },
  })
}
