"use server"

import { inboundWebhookService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertCanManageInboundWebhooks } from "../lib/assert-super-admin"
import { inboundWebhookConfigRequest } from "../schema/action"

export const updateInboundWebhookAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(inboundWebhookConfigRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput, ctx }) => {
      assertCanManageInboundWebhooks(ctx.workspaceMemberPermissions)
      await inboundWebhookService.update({
        workspaceId,
        id,
        ...parsedInput,
        sampleJson: parsedInput.sampleJson ?? null,
      })
    },
  )
