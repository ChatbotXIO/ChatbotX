import { messengerIntegrationService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  integration as integrationMessenger,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
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
  if (!integrationMessenger.refreshAuth) {
    return
  }

  await runJobWithAuditContext(
    { workspaceId: integration.workspaceId, source: REFRESH_SOURCE },
    () =>
      distributedLock.runExclusive({
        key: `auth:refresh:messenger:${integration.id}`,
        timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
        fn: async () => {
          try {
            const current =
              await messengerIntegrationService.findByIdForWorkspace({
                id: integration.id,
                workspaceId: integration.workspaceId,
              })
            if (!current) {
              return
            }

            const auth = current.auth as MessengerAuthValue
            const newAuth = await integrationMessenger.refreshAuth?.({ auth })

            await messengerIntegrationService.updateAuth({
              id: integration.id,
              workspaceId: integration.workspaceId,
              auth: newAuth as MessengerAuthValue,
            })

            await auditService.record({
              action: "refresh",
              detail: "auto-refreshed the Messenger channel token",
              workspaceId: integration.workspaceId,
              source: REFRESH_SOURCE,
            })
          } catch (error) {
            logger.error(
              error,
              `[refreshMessengerTokens] id=${integration.id} failed`,
            )
            await messengerIntegrationService.markTokenRefreshError(
              integration.id,
              error instanceof Error ? error.message : String(error),
            )
          }
        },
      }),
  )
}

export async function refreshMessengerTokens(): Promise<void> {
  if (!integrationMessenger.refreshAuth) {
    logger.warn("[refreshMessengerTokens] integration does not support refresh")
    return
  }

  const integrations =
    await messengerIntegrationService.findAllForTokenRefresh()

  for (let i = 0; i < integrations.length; i += BATCH_SIZE) {
    const batch = integrations.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(refreshOne))
  }
}
