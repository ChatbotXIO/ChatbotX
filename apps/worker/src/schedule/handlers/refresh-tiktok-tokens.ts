import { tiktokIntegrationService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { logProviderError } from "@chatbotx.io/business/error-log"
import type { TiktokAuthValue } from "@chatbotx.io/integration-tiktok"
import { refreshAccessToken } from "@chatbotx.io/integration-tiktok/apis/auth"
import { buildTokenTimestamps } from "@chatbotx.io/integration-tiktok/lib/token-utils"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10
const REFRESH_SOURCE = "schedule:refreshChannelTokens"

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  await runJobWithAuditContext(
    { workspaceId: integration.workspaceId, source: REFRESH_SOURCE },
    () =>
      distributedLock.runExclusive({
        key: `auth:refresh:tiktok:${integration.id}`,
        timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
        fn: async () => {
          try {
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

            await tiktokIntegrationService.updateAuth(integration.id, {
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
            })

            await auditService.record({
              action: "refresh",
              detail: "auto-refreshed the TikTok channel token",
              workspaceId: integration.workspaceId,
              source: REFRESH_SOURCE,
            })
          } catch (error) {
            logger.error(
              error,
              `[refreshTiktokTokens] id=${integration.id} failed`,
            )
            await tiktokIntegrationService.markTokenRefreshError(
              integration.id,
              error instanceof Error ? error.message : String(error),
            )
            await logProviderError({
              provider: "tiktok",
              workspaceId: integration.workspaceId,
              error,
            })
          }
        },
      }),
  )
}

export async function refreshTiktokTokens(): Promise<void> {
  const integrations = await tiktokIntegrationService.findAll()

  for (let i = 0; i < integrations.length; i += BATCH_SIZE) {
    const batch = integrations.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(refreshOne))
  }
}
