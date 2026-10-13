"use server"

import { broadcastRecurrenceService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { setBroadcastRunSkippedSchema } from "../schema/action"

export const setBroadcastRunSkippedAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(setBroadcastRunSkippedSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    // The service owns the series lock and the validation — shared with the
    // public API's `skipOccurrence` / `restoreOccurrence` routes.
    return await broadcastRecurrenceService.setOccurrenceExcluded({
      workspaceId,
      idOrName: id,
      date: parsedInput.date,
      excluded: parsedInput.skipped,
    })
  })
