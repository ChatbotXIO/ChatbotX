import { tiktokIntegrationService } from "@chatbotx.io/business"
import {
  isRevokedTokenError,
  type TiktokAuthValue,
} from "@chatbotx.io/integration-tiktok"
import { refreshAccessToken } from "@chatbotx.io/integration-tiktok/apis/auth"
import { parseTiktokScopes } from "@chatbotx.io/integration-tiktok/lib/scopes"
import { buildTokenTimestamps } from "@chatbotx.io/integration-tiktok/lib/token-utils"
import { logger } from "../../lib/logger"
import { refreshWithErrorHandling, runRefreshBatch } from "./refresh-runner"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  await refreshWithErrorHandling<TiktokAuthValue>({
    id: integration.id,
    workspaceId: integration.workspaceId,
    provider: "tiktok",
    label: "refreshTiktokTokens",
    lockKey: `auth:refresh:tiktok:${integration.id}`,
    lockTimeout: REFRESH_LOCK_TIMEOUT_SECONDS,
    refresh: async () => {
      const current = await tiktokIntegrationService.findById({
        id: integration.id,
        workspaceId: integration.workspaceId,
      })
      const auth = current.auth as TiktokAuthValue
      if (!auth.tokens.refreshToken) {
        logger.warn(
          `[refreshTiktokTokens] id=${integration.id} skipped: no refreshToken`,
        )
        return
      }

      const newTokens = await refreshAccessToken(
        { clientId: auth.clientId, clientSecret: auth.clientSecret },
        auth.tokens.refreshToken,
      )

      return {
        ...auth,
        tokens: {
          ...auth.tokens,
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          ...buildTokenTimestamps(
            newTokens.expires_in,
            newTokens.refresh_expires_in,
          ),
        },
        // A refresh never grants a new scope, but it does report the
        // current set — which is how a connection made before scopes
        // were recorded stops being reported as "unknown" on its own.
        metadata: {
          ...auth.metadata,
          scopes: parseTiktokScopes(newTokens.scope),
        },
      }
    },
    apply: (newAuth) =>
      tiktokIntegrationService.updateAuth({
        id: integration.id,
        workspaceId: integration.workspaceId,
        auth: newAuth,
      }),
    markError: (error) =>
      tiktokIntegrationService.markTokenRefreshError({
        id: integration.id,
        workspaceId: integration.workspaceId,
        error: error instanceof Error ? error.message : String(error),
        isRevoked: isRevokedTokenError(error),
      }),
    auditDetail: "auto-refreshed the TikTok channel token",
  })
}

export async function refreshTiktokTokens(): Promise<void> {
  const integrations = await tiktokIntegrationService.findAll()

  await runRefreshBatch(integrations, refreshOne, BATCH_SIZE)
}
