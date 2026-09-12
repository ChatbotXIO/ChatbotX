"use server"

import { messagingAdsConnectionService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectMessagingAdsRequest } from "./schema"

/** `bindArgsParsedInputs`: `[workspaceId, integrationId]`. Best-effort revokes the Graph token, then deletes the `MessagingAdsConnection` row (and invalidates its cache) — see `messagingAdsConnectionService.revokeAndDisconnect`. */
export const disconnectMessagingAdsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(connectMessagingAdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId],
      parsedInput,
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      await messagingAdsConnectionService.revokeAndDisconnect({
        workspaceId,
        channel: parsedInput.channel,
        integrationId,
      })
    },
  )
