"use server"

import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  normalizeScheduleTime,
  type ScheduleBroadcastSchema,
  scheduleBroadcastSchema,
} from "../schema/action"

// A `now` draft gets `schedulesAt = startOfMinute(now) <= now`, so
// `enqueueBroadcast`'s `schedulesAt <= startTime AND status = scheduled` scan
// picks it up on its next minute tick — the same path a "send now" create takes.
const resolveScheduleTime = (parsedInput: ScheduleBroadcastSchema): Date =>
  normalizeScheduleTime(
    parsedInput.schedulesType === "future" && parsedInput.schedulesAt
      ? parsedInput.schedulesAt
      : new Date().toISOString(),
  )

export const scheduleBroadcastAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(scheduleBroadcastSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    const result = await broadcastService.scheduleDraft({
      workspaceId,
      broadcastId: id,
      schedulesType: parsedInput.schedulesType,
      schedulesAt: resolveScheduleTime(parsedInput),
    })

    // Mirrors `createBroadcastAction`: only an immediate send is a launch; a
    // future schedule is audited as a launch when the send actually happens.
    if (parsedInput.schedulesType === "now") {
      await auditService.record({
        workspaceId,
        action: "launch",
        detail: `launched a broadcast (#${result.id})`,
      })
    }

    return result
  })
