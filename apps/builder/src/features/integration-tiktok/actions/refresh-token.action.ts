"use server"

import { tiktokIntegrationService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  isRevokedTokenError,
  refreshTiktokAuth,
  type TiktokAuthValue,
} from "@chatbotx.io/integration-tiktok"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const refreshTiktokTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      await refreshTiktokToken({ workspaceId, id })
    },
  )

const refreshTiktokToken = async (ctx: { workspaceId: string; id: string }) => {
  const integration = await tiktokIntegrationService.findById({
    id: ctx.id,
    workspaceId: ctx.workspaceId,
  })

  // The SDK auth store's lock, shared with the scheduled job and on-demand
  // refreshes: TikTok rotates refresh tokens, so two refreshes must never race.
  await tiktokIntegrationService.withTokenRefreshLock(integration, async () => {
    // Re-read inside the lock: the refresh token may have rotated meanwhile.
    const current = await tiktokIntegrationService.findById({
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    })
    const auth = current.auth as TiktokAuthValue

    if (!auth.tokens.refreshToken) {
      throw new ChatbotXException("TikTok refresh token not available")
    }

    try {
      const updatedAuth = await refreshTiktokAuth(auth)

      await tiktokIntegrationService.updateAuth({
        id: ctx.id,
        workspaceId: ctx.workspaceId,
        auth: updatedAuth,
      })

      await auditService.record({
        workspaceId: ctx.workspaceId,
        action: "refresh",
        detail: "refreshed the TikTok channel token",
      })
    } catch (error) {
      logger.error(
        { err: error, integrationId: ctx.id, workspaceId: ctx.workspaceId },
        "Failed to refresh TikTok token",
      )
      await tiktokIntegrationService.markTokenRefreshError({
        id: ctx.id,
        workspaceId: ctx.workspaceId,
        error: error instanceof Error ? error.message : String(error),
        isRevoked: isRevokedTokenError(error),
      })
      throw new ChatbotXException("Failed to refresh TikTok token")
    }
  })
}
