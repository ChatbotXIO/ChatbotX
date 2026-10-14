"use server"

import { inboundWebhookService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertCanManageInboundWebhooks } from "../lib/assert-super-admin"

export const regenerateInboundWebhookTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], ctx }) => {
    assertCanManageInboundWebhooks(ctx.workspaceMemberPermissions)
    await inboundWebhookService.regenerateToken({ workspaceId, id })
  })
