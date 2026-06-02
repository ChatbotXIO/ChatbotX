"use server"

import { inboxTeamService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { createInboxTeamRequest } from "../schema/action"

export const createInboxTeamAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createInboxTeamRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    } = props

    await inboxTeamService.create({
      workspaceId,
      data: {
        name: parsedInput.name,
        userIds: parsedInput.userIds,
      },
    })
  })
