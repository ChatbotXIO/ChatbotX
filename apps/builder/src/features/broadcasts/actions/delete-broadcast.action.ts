"use server"

import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const deleteBroadcastAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const result = await broadcastService.softDeleteBroadcasts({
      workspaceId,
      ids: [id],
    })

    // `deletedCount` is 0 when the broadcast was already deleted, foreign,
    // or `sending` — only audit when something actually changed.
    if (result.deletedCount > 0) {
      await auditService.record({
        workspaceId,
        action: "delete",
        detail: `deleted ${result.deletedCount} broadcast(s)`,
      })
    }

    return result
  })
