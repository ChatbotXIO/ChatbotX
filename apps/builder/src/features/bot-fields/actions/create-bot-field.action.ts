"use server"

import { botFieldService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBotFieldRequest } from "../schema/action"

export const createBotFieldAction = workspaceActionClient
  .inputSchema(createBotFieldRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    return await botFieldService.create({ workspaceId, data: parsedInput })
  })
