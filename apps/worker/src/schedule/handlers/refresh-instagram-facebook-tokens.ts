import { instagramIntegrationService } from "@chatbotx.io/business"
import {
  type InstagramAuthValue,
  integration as integrationInstagramFacebook,
} from "@chatbotx.io/integration-instagram-facebook"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  if (!integrationInstagramFacebook.refreshAuth) {
    return
  }

  await distributedLock.runExclusive({
    key: `auth:refresh:instagramFacebook:${integration.id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      try {
        const current = await instagramIntegrationService.findByIdForWorkspace({
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
      } catch (error) {
        logger.error(
          error,
          `[refreshInstagramFacebookTokens] id=${integration.id} failed`,
        )
        await instagramIntegrationService.markTokenRefreshError(
          integration.id,
          error instanceof Error ? error.message : String(error),
        )
      }
    },
  })
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
