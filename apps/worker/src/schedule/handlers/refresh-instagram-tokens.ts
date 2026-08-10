import { instagramIntegrationService } from "@chatbotx.io/business"
import {
  type InstagramAuthValue,
  integration as integrationInstagram,
} from "@chatbotx.io/integration-instagram"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  if (!integrationInstagram.refreshAuth) {
    return
  }

  await distributedLock.runExclusive({
    key: `auth:refresh:instagram:${integration.id}`,
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
        const newAuth = await integrationInstagram.refreshAuth?.({ auth })

        await instagramIntegrationService.updateAuth({
          id: integration.id,
          workspaceId: integration.workspaceId,
          auth: newAuth as InstagramAuthValue,
        })
      } catch (error) {
        logger.error(
          error,
          `[refreshInstagramTokens] id=${integration.id} failed`,
        )
        await instagramIntegrationService.markTokenRefreshError(
          integration.id,
          error instanceof Error ? error.message : String(error),
        )
      }
    },
  })
}

export async function refreshInstagramTokens(): Promise<void> {
  if (!integrationInstagram.refreshAuth) {
    logger.warn("[refreshInstagramTokens] integration does not support refresh")
    return
  }

  const integrations = await instagramIntegrationService.findForTokenRefresh()

  for (let i = 0; i < integrations.length; i += BATCH_SIZE) {
    const batch = integrations.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(refreshOne))
  }
}
