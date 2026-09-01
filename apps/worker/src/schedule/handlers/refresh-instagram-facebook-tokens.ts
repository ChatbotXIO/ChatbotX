import { instagramIntegrationService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { logProviderError } from "@chatbotx.io/business/error-log"
import {
  type InstagramAuthValue,
  integration as integrationInstagramFacebook,
} from "@chatbotx.io/integration-instagram-facebook"
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
  if (!integrationInstagramFacebook.refreshAuth) {
    return
  }

  await runJobWithAuditContext(
    { workspaceId: integration.workspaceId, source: REFRESH_SOURCE },
    () =>
      distributedLock.runExclusive({
        key: `auth:refresh:instagramFacebook:${integration.id}`,
        timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
        fn: async () => {
          try {
            const current =
              await instagramIntegrationService.findByIdForWorkspace({
                id: integration.id,
                workspaceId: integration.workspaceId,
              })
            if (!current) {
              return
            }

            const auth = current.auth as InstagramAuthValue
            const newAuth = await integrationInstagramFacebook.refreshAuth?.({
              auth,
            })

            await instagramIntegrationService.updateAuth({
              id: integration.id,
              workspaceId: integration.workspaceId,
              auth: newAuth as InstagramAuthValue,
            })

            await auditService.record({
              action: "refresh",
              detail: "auto-refreshed the Instagram channel token",
              workspaceId: integration.workspaceId,
              source: REFRESH_SOURCE,
            })
          } catch (error) {
            logger.error(
              error,
              `[refreshInstagramFacebookTokens] id=${integration.id} failed`,
            )
            await instagramIntegrationService.markTokenRefreshError(
              integration.id,
              error instanceof Error ? error.message : String(error),
            )
            await logProviderError({
              // The Facebook-linked variant logs under the one `instagram` label,
              // so a workspace filtering the Provider column sees every failure
              // from this integration in one place.
              provider: "instagram",
              workspaceId: integration.workspaceId,
              error,
            })
          }
        },
      }),
  )
}

export async function refreshInstagramFacebookTokens(): Promise<void> {
  if (!integrationInstagramFacebook.refreshAuth) {
    logger.warn(
      "[refreshInstagramFacebookTokens] integration does not support refresh",
    )
    return
  }

  const integrations =
    await instagramIntegrationService.findFacebookForTokenRefresh()

  for (let i = 0; i < integrations.length; i += BATCH_SIZE) {
    const batch = integrations.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(refreshOne))
  }
}
