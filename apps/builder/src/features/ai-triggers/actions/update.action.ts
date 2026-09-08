"use server"

import { aiTriggerService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { updateAITriggerRequest } from "@/features/ai-triggers/schema/action"
import { workspaceActionClient } from "@/lib/safe-action"

export const updateAITriggerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAITriggerRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await aiTriggerService.update({ workspaceId, id }, parsedInput)
  })
