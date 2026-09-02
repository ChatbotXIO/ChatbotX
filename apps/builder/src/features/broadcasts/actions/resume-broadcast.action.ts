"use server"

import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const resumeBroadcastAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const result = await broadcastService.resumeSending({
      workspaceId,
      broadcastId: id,
    })

    await auditService.record({
      workspaceId,
      action: "broadcast_resumed",
      detail: `resumed a broadcast (#${result.id})`,
    })

    return result
  })
