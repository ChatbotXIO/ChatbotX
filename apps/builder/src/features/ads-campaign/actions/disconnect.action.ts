"use server"

import { messagingAdsConnectionService } from "@chatbotx.io/business"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import {
  facebookAdsAuthSchema,
  integration as facebookAdsIntegration,
} from "@chatbotx.io/integration-facebook-ads"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectMessagingAdsRequest } from "./schema"

/** `bindArgsParsedInputs`: `[workspaceId, integrationId]`. Best-effort revokes the Graph token, mirroring `disconnectFacebookAdsAction`, then deletes the `MessagingAdsConnection` row (and invalidates its cache — see `messagingAdsConnectionService.disconnect`). */
export const disconnectMessagingAdsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(connectMessagingAdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId],
      parsedInput,
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      const connection = await messagingAdsConnectionService.findForIntegration(
        {
          workspaceId,
          channel: parsedInput.channel,
          integrationId,
        },
      )

      if (connection) {
        try {
          const auth = await encryptUtils.decryptObject(
            encryptedDataSchema.parse(connection.auth),
            facebookAdsAuthSchema,
          )
          await facebookAdsIntegration.disconnect?.(auth)
        } catch (e) {
          logger.error(
            e,
            `Unable to revoke messaging-ads token for workspace ${workspaceId} integration ${integrationId}`,
          )
        }
      }

      await messagingAdsConnectionService.disconnect({
        workspaceId,
        channel: parsedInput.channel,
        integrationId,
      })
      return
    },
  )
