"use server"

import { broadcastService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const deleteBroadcastAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    // The service owns the deletable-status guard and the audit record
    // (only when `deletedCount > 0`) — shared with the public API's
    // `delete` route.
    return await broadcastService.softDeleteBroadcasts({
      workspaceId,
      ids: [id],
    })
  })
