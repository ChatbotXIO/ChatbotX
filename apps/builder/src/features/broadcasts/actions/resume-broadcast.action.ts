"use server"

import { broadcastService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { resumeBroadcastSchema } from "../schema/action"
import { withBroadcastPlanLimitOutcome } from "./broadcast-plan-limit-outcome"

export const resumeBroadcastAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(resumeBroadcastSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    // The service owns the transition guard and the audit record — shared
    // with the public API's `resume` route.
    return await withBroadcastPlanLimitOutcome(() =>
      broadcastService.resumeSending({
        workspaceId,
        broadcastId: id,
        sendRatePerMinute: parsedInput.sendRatePerMinute,
      }),
    )
  })
