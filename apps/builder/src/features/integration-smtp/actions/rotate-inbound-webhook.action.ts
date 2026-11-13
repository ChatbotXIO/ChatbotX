"use server"

import { workspaceService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { resolveInboundWebhook } from "../lib/inbound-webhook"

/** Replaces the inbound webhook URL; the previous one stops working at once. */
export const rotateInboundWebhookAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props
    const workspace = await workspaceService.findById({ id: workspaceId })
    return await resolveInboundWebhook({
      workspaceId,
      ownerId: workspace.ownerId,
      id,
      rotate: true,
    })
  })
