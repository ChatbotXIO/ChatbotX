"use server"

import { inboundWebhookService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { assertCanManageInboundWebhooks } from "../lib/assert-super-admin"
import { toInboundWebhookRequestDetail } from "../schema/public"

/** The details of one delivery, payload included, for the editor's request log. */
export const getInboundWebhookRequestAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([
    zodBigintAsString().describe("workspaceId"),
    zodBigintAsString().describe("inboundWebhookId"),
    zodBigintAsString().describe("requestId"),
  ])
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, inboundWebhookId, requestId],
      ctx,
    }) => {
      assertCanManageInboundWebhooks(ctx.workspaceMemberPermissions)
      return toInboundWebhookRequestDetail(
        await inboundWebhookService.findRequestOrFail({
          workspaceId,
          inboundWebhookId,
          id: requestId,
        }),
        true,
      )
    },
  )
