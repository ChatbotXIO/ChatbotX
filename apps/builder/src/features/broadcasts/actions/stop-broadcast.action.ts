"use server"

import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const stopBroadcastAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const result = await broadcastService.stopSending({
      workspaceId,
      broadcastId: id,
    })

    await auditService.record({
      workspaceId,
      action: "broadcast_stopped",
      detail: `stopped a broadcast (#${result.id})`,
    })

    return result
  })
