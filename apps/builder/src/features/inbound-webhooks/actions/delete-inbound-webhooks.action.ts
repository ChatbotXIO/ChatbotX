"use server"

import { inboundWebhookService } from "@chatbotx.io/business"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { assertCanManageInboundWebhooks } from "../lib/assert-super-admin"

// Deleting stays available after a trial expires (AGENTS.md invariant 14).
export const deleteInboundWebhooksAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    assertCanManageInboundWebhooks(ctx.workspaceMemberPermissions)
    await inboundWebhookService.deleteMany({
      workspaceId,
      ids: parsedInput.ids,
    })
  })
