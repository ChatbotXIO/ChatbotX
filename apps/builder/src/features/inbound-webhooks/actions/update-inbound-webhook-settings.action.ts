"use server"

import { inboundWebhookService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertCanManageInboundWebhooks } from "../lib/assert-super-admin"
import { updateInboundWebhookSettingsRequest } from "../schema/action"

export const updateInboundWebhookSettingsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateInboundWebhookSettingsRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput, ctx }) => {
      assertCanManageInboundWebhooks(ctx.workspaceMemberPermissions)
      await inboundWebhookService.updateSettings({
        workspaceId,
        id,
        ...parsedInput,
      })
    },
  )
