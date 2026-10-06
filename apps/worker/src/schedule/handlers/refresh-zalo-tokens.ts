import { zaloIntegrationService } from "@chatbotx.io/business"
import {
  calculateExpiresAt,
  isRevokedTokenError,
  refreshAccessToken,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { logger } from "../../lib/logger"
import { refreshWithErrorHandling, runRefreshBatch } from "./refresh-runner"

const BATCH_SIZE = 50
// Must outlive the OAuth client's 30s HTTP timeout: the Zalo refresh token is
// single-use, so if the lock expired mid-call another process could consume
// the same refresh token concurrently and clobber the rotated tokens.
const REFRESH_LOCK_TIMEOUT_SECONDS = 60

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  await refreshWithErrorHandling<ZaloAuthValue>({
    id: integration.id,
    workspaceId: integration.workspaceId,
    provider: "zalo",
    label: "refreshZaloTokens",
    lockKey: `auth:refresh:zalo:${integration.id}`,
    lockTimeout: REFRESH_LOCK_TIMEOUT_SECONDS,
    onLockError: (error) => {
      // A failed lock acquisition (another process already refreshing,
      // redis hiccup) must not reject the whole batch and abort the
      // remaining integrations for the day.
      logger.error(
        error,
        `[refreshZaloTokens] id=${integration.id} lock failed`,
      )
    },
    refresh: async () => {
      const current = await zaloIntegrationService.findById({
        id: integration.id,
        workspaceId: integration.workspaceId,
      })
      const auth = current.auth as ZaloAuthValue
      if (!auth.tokens.refreshToken) {
        logger.warn(
          `[refreshZaloTokens] id=${integration.id} skipped: no refreshToken`,
        )
        return
      }

      const newTokens = await refreshAccessToken(auth, auth.tokens.refreshToken)

      return {
        ...auth,
        tokens: {
          ...auth.tokens,
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresAt: calculateExpiresAt(newTokens.expires_in),
        },
      }
    },
    apply: (newAuth) =>
      zaloIntegrationService.updateAuth(integration.id, newAuth),
    markError: (error) =>
      zaloIntegrationService.markTokenRefreshError({
        id: integration.id,
        workspaceId: integration.workspaceId,
        error: error instanceof Error ? error.message : String(error),
        isRevoked: isRevokedTokenError(error),
      }),
    auditDetail: "auto-refreshed the Zalo channel permissions",
  })
}

export async function refreshZaloTokens(): Promise<void> {
  const integrations = await zaloIntegrationService.findAll()

  await runRefreshBatch(integrations, refreshOne, BATCH_SIZE)
}
