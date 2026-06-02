"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { updateAIAgentRequest } from "@/features/ai-agents/schemas/action"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiAgentService } from "../ai-agent.service"

export const updateAIAgentAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAIAgentRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await aiAgentService.updateAIAgent({ workspaceId, id }, parsedInput)
  })
