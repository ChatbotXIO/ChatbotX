import { messengerIntegrationService } from "@chatbotx.io/business"
import {
  integration as integrationMessenger,
  isRevokedTokenError,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import { logger } from "../../lib/logger"
import { refreshWithErrorHandling, runRefreshBatch } from "./refresh-runner"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  if (!integrationMessenger.refreshAuth) {
    return
  }

  await refreshWithErrorHandling<MessengerAuthValue>({
    id: integration.id,
    workspaceId: integration.workspaceId,
    provider: "messenger",
    label: "refreshMessengerTokens",
    lockKey: `auth:refresh:messenger:${integration.id}`,
    lockTimeout: REFRESH_LOCK_TIMEOUT_SECONDS,
    refresh: async () => {
      const current = await messengerIntegrationService.findByIdForWorkspace({
        id: integration.id,
        workspaceId: integration.workspaceId,
      })
      if (!current) {
        return
      }

      const auth = current.auth as MessengerAuthValue
      return (await integrationMessenger.refreshAuth?.({
        auth,
      })) as MessengerAuthValue
    },
    apply: (newAuth) =>
      messengerIntegrationService.updateAuth({
        id: integration.id,
        workspaceId: integration.workspaceId,
        auth: newAuth,
      }),
    markError: (error) =>
      messengerIntegrationService.markTokenRefreshError({
        id: integration.id,
        workspaceId: integration.workspaceId,
        error: error instanceof Error ? error.message : String(error),
        isRevoked: isRevokedTokenError(error),
      }),
    auditDetail: "auto-refreshed the Messenger channel token",
  })
}

export async function refreshMessengerTokens(): Promise<void> {
  if (!integrationMessenger.refreshAuth) {
    logger.warn("[refreshMessengerTokens] integration does not support refresh")
    return
  }

  const integrations =
    await messengerIntegrationService.findAllForTokenRefresh()

  await runRefreshBatch(integrations, refreshOne, BATCH_SIZE)
}
