"use server"

import { broadcastService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const stopBroadcastAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    // The service owns the transition guard and the audit record — shared
    // with the public API's `stop` route.
    return await broadcastService.stopSending({
      workspaceId,
      broadcastId: id,
    })
  })
