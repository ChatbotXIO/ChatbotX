"use server"

import { tiktokIntegrationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { TiktokAuthValue } from "@chatbotx.io/integration-tiktok"
import { refreshAccessToken } from "@chatbotx.io/integration-tiktok/apis/auth"
import { buildTokenTimestamps } from "@chatbotx.io/integration-tiktok/lib/token-utils"
import { distributedLock } from "@chatbotx.io/redis"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
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

const REFRESH_LOCK_TIMEOUT_SECONDS = 10

const refreshTiktokToken = async (ctx: { workspaceId: string; id: string }) => {
  await distributedLock.runExclusive({
    key: `auth:refresh:tiktok:${ctx.id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      const integrationTiktok = await tiktokIntegrationService.findById({
        id: ctx.id,
        workspaceId: ctx.workspaceId,
      })

      const auth = integrationTiktok.auth as TiktokAuthValue

      if (!auth.tokens.refreshToken) {
        throw new ChatbotXException("TikTok refresh token not available")
      }

      try {
        const newTokens = await refreshAccessToken(
          { clientId: auth.clientId, clientSecret: auth.clientSecret },
          auth.tokens.refreshToken,
        )

        const updatedAuth: TiktokAuthValue = {
          ...auth,
          tokens: {
            ...auth.tokens,
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token,
            ...buildTokenTimestamps(
              newTokens.expires_in,
              newTokens.refresh_expires_in,
            ),
          },
        }

        await tiktokIntegrationService.updateAuth(ctx.id, updatedAuth)
      } catch (error) {
        logger.error(error, "Failed to refresh TikTok token")
        await tiktokIntegrationService.markTokenRefreshError(
          ctx.id,
          error instanceof Error ? error.message : String(error),
        )
        throw new ChatbotXException("Failed to refresh TikTok token")
      }
    },
  })
}
