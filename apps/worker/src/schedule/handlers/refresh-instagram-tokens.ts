import { instagramIntegrationService } from "@chatbotx.io/business"
import {
  type InstagramAuthValue,
  integration as integrationInstagram,
  isRevokedTokenError,
} from "@chatbotx.io/integration-instagram"
import { logger } from "../../lib/logger"
import { refreshWithErrorHandling, runRefreshBatch } from "./refresh-runner"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  if (!integrationInstagram.refreshAuth) {
    return
  }

  await refreshWithErrorHandling<InstagramAuthValue>({
    id: integration.id,
    workspaceId: integration.workspaceId,
    provider: "instagram",
    label: "refreshInstagramTokens",
    lockKey: `auth:refresh:instagram:${integration.id}`,
    lockTimeout: REFRESH_LOCK_TIMEOUT_SECONDS,
    refresh: async () => {
      const current = await instagramIntegrationService.findByIdForWorkspace({
        id: integration.id,
        workspaceId: integration.workspaceId,
      })
      if (!current) {
        return
      }

      const auth = current.auth as InstagramAuthValue
      const refreshedAuth = await integrationInstagram.refreshAuth?.({ auth })
      if (!refreshedAuth) {
        throw new Error("Instagram refreshAuth returned no auth")
      }
      return refreshedAuth
    },
    apply: (newAuth) =>
      instagramIntegrationService.updateAuth({
        id: integration.id,
        workspaceId: integration.workspaceId,
        auth: newAuth,
      }),
    markError: (error) =>
      instagramIntegrationService.markTokenRefreshError({
        id: integration.id,
        workspaceId: integration.workspaceId,
        error: error instanceof Error ? error.message : String(error),
        isRevoked: isRevokedTokenError(error),
      }),
    auditDetail: "auto-refreshed the Instagram channel token",
  })
}

export async function refreshInstagramTokens(): Promise<void> {
  if (!integrationInstagram.refreshAuth) {
    logger.warn("[refreshInstagramTokens] integration does not support refresh")
    return
  }

  const integrations = await instagramIntegrationService.findForTokenRefresh()

  await runRefreshBatch(integrations, refreshOne, BATCH_SIZE)
}
