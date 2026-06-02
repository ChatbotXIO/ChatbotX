"use server"

import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"
import { aiAgentService } from "../ai-agent.service"

export const deleteAIAgentAction = authActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput: { ids },
    } = props

    await aiAgentService.delete({ workspaceId, ids })
  })
