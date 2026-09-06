"use server"

import { aiTriggerService } from "@chatbotx.io/business"
import { createAITriggerRequest } from "@/features/ai-triggers/schema/action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const createAITriggerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAITriggerRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    await aiTriggerService.create(workspaceId, parsedInput)
  })
