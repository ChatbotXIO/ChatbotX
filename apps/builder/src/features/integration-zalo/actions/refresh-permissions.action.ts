"use server"

import { zaloIntegrationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  integration as integrationZalo,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { distributedLock } from "@chatbotx.io/redis"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const refreshZaloPermissionsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await refreshZaloPermissions({ workspaceId, id })
  })

const REFRESH_LOCK_TIMEOUT_SECONDS = 10

const refreshZaloPermissions = async (ctx: {
  workspaceId: string
  id: string
}) => {
  await distributedLock.runExclusive({
    key: `auth:refresh:zalo:${ctx.id}`,
    timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
    fn: async () => {
      const integrationZaloRow = await zaloIntegrationService.findById({
        id: ctx.id,
        workspaceId: ctx.workspaceId,
      })

      const auth = integrationZaloRow.auth as ZaloAuthValue

      try {
        if (!integrationZalo.refreshAuth) {
          throw new ChatbotXException(
            "Zalo integration does not support refresh",
          )
        }
        const updatedAuth = await integrationZalo.refreshAuth({ auth })

        await zaloIntegrationService.updateAuth(ctx.id, updatedAuth)
      } catch (error) {
        logger.error(error, "Failed to refresh Zalo permissions")
        await zaloIntegrationService.markTokenRefreshError(
          ctx.id,
          error instanceof Error ? error.message : String(error),
        )
        throw new ChatbotXException("Failed to refresh Zalo permissions")
      }
    },
  })
}
