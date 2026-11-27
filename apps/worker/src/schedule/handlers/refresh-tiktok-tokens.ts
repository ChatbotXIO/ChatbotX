import { tiktokIntegrationService } from "@chatbotx.io/business"
import {
  isRevokedTokenError,
  refreshTiktokAuth,
  type TiktokAuthValue,
} from "@chatbotx.io/integration-tiktok"
import { logger } from "../../lib/logger"
import { refreshWithErrorHandling, runRefreshBatch } from "./refresh-runner"

const BATCH_SIZE = 50
const REFRESH_LOCK_TIMEOUT_SECONDS = 10

async function refreshOne(integration: {
  id: string
  workspaceId: string
  inboxId: string
}): Promise<void> {
  await refreshWithErrorHandling<TiktokAuthValue>({
    id: integration.id,
    workspaceId: integration.workspaceId,
    provider: "tiktok",
    label: "refreshTiktokTokens",
    lockKey: `auth:refresh:tiktok:${integration.id}`,
    lockTimeout: REFRESH_LOCK_TIMEOUT_SECONDS,
    // The SDK's on-demand refresh takes this same lock. TikTok rotates refresh
    // tokens, so two refreshes racing on one would leave a revoked one behind.
    withLock: (fn) =>
      tiktokIntegrationService.withTokenRefreshLock(integration, fn),
    refresh: async () => {
      // Read inside the lock: the refresh token may have rotated since the
      // batch listing was taken.
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
      return await refreshTiktokAuth(auth)
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
