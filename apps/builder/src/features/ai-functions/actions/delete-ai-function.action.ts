"use server"

import { aiFunctionService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteAIFunctionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, aiFunctionId],
    } = props
    return await aiFunctionService.deleteAIFunction({
      workspaceId,
      aiFunctionId,
    })
  })
