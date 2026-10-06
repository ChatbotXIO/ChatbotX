import { instagramIntegrationService } from "@chatbotx.io/business"
import {
  type InstagramAuthValue,
  integration as integrationInstagramFacebook,
  isRevokedTokenError,
} from "@chatbotx.io/integration-instagram-facebook"
import { logger } from "../../lib/logger"
import { refreshWithErrorHandling, runRefreshBatch } from "./refresh-runner"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  if (!integrationInstagramFacebook.refreshAuth) {
    return
  }

  await refreshWithErrorHandling<InstagramAuthValue>({
    id: integration.id,
    workspaceId: integration.workspaceId,
    // The Facebook-linked variant logs under the one `instagram` label,
    // so a workspace filtering the Provider column sees every failure
    // from this integration in one place.
    provider: "instagram",
    label: "refreshInstagramFacebookTokens",
    lockKey: `auth:refresh:instagramFacebook:${integration.id}`,
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
      const refreshedAuth = await integrationInstagramFacebook.refreshAuth?.({
        auth,
      })
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

export async function refreshInstagramFacebookTokens(): Promise<void> {
  if (!integrationInstagramFacebook.refreshAuth) {
    logger.warn(
      "[refreshInstagramFacebookTokens] integration does not support refresh",
    )
    return
  }

  const integrations =
    await instagramIntegrationService.findFacebookForTokenRefresh()

  await runRefreshBatch(integrations, refreshOne, BATCH_SIZE)
}
