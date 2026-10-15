"use server"

import { inboundWebhookService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { assertCanManageInboundWebhooks } from "../lib/assert-super-admin"

/**
 * The token is part of the URL the "Get link" dialog shows, so it is fetched
 * on demand rather than shipped with every row of the list.
 */
export const getInboundWebhookTokenAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], ctx }) => {
    assertCanManageInboundWebhooks(ctx.workspaceMemberPermissions)
    const webhook = await inboundWebhookService.findOrFail({ workspaceId, id })
    return { token: webhook.token }
  })
