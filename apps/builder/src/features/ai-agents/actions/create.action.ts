"use server"

import { createAIAgentRequest } from "@/features/ai-agents/schemas/action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiAgentService } from "../ai-agent.service"

export const createAIAgentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIAgentRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    } = props

    await aiAgentService.create(workspaceId, parsedInput)
  })
