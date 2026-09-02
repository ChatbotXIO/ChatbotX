"use server"

import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const moveBroadcastToDraftAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const result = await broadcastService.moveToDraft({
      workspaceId,
      broadcastId: id,
    })

    await auditService.record({
      workspaceId,
      action: "broadcast_moved_to_draft",
      detail: `moved broadcast (#${result.id}) to draft`,
    })

    return result
  })
