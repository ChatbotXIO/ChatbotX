"use server"

import { broadcastService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { resolveScheduleTime, scheduleBroadcastSchema } from "../schema/action"

export const scheduleBroadcastAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(scheduleBroadcastSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    // The service owns the draft-status guard and the audit record (only
    // when `schedulesType === "now"`) — shared with the public API's
    // `schedule` route.
    return await broadcastService.scheduleDraft({
      workspaceId,
      broadcastId: id,
      schedulesType: parsedInput.schedulesType,
      schedulesAt: resolveScheduleTime(parsedInput),
    })
  })
