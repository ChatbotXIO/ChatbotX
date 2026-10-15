"use server"

import { inboundWebhookService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertCanManageInboundWebhooks } from "../lib/assert-super-admin"
import { createInboundWebhookRequest } from "../schema/action"

export const createInboundWebhookAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createInboundWebhookRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    assertCanManageInboundWebhooks(ctx.workspaceMemberPermissions)
    const webhook = await inboundWebhookService.create({
      workspaceId,
      name: parsedInput.name,
    })
    return { id: webhook.id }
  })
