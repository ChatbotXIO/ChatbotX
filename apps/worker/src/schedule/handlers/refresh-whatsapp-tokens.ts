import { integrationWhatsappService } from "@chatbotx.io/business"
import {
  integration as integrationWhatsapp,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  if (!integrationWhatsapp.refreshAuth) {
    return
  }

  await distributedLock.runExclusive({
    key: `auth:refresh:whatsapp:${integration.id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      try {
        const current = await integrationWhatsappService.findByIdForWorkspace({
          id: integration.id,
          workspaceId: integration.workspaceId,
        })
        if (!current) {
          return
        }

        const auth = current.auth as WhatsappAuthValue
        if (auth.metadata.isManual) {
          return
        }

        const newAuth = await integrationWhatsapp.refreshAuth?.({ auth })

        await integrationWhatsappService.updateAuth({
          id: integration.id,
          workspaceId: integration.workspaceId,
          auth: newAuth as WhatsappAuthValue,
        })
      } catch (error) {
        logger.error(
          error,
          `[refreshWhatsappTokens] id=${integration.id} failed`,
        )
        await integrationWhatsappService.markTokenRefreshError(
          integration.id,
          error instanceof Error ? error.message : String(error),
        )
      }
    },
  })
}

export async function refreshWhatsappTokens(): Promise<void> {
  if (!integrationWhatsapp.refreshAuth) {
    logger.warn("[refreshWhatsappTokens] integration does not support refresh")
    return
  }

  const integrations = await integrationWhatsappService.findAllForTokenRefresh()

  for (let i = 0; i < integrations.length; i += BATCH_SIZE) {
    const batch = integrations.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(refreshOne))
  }
}
