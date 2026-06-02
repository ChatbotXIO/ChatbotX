"use server"

import { inboxTeamService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { bulkUpdateIdsRequest } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteTeamMembersAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsClientInputs: [workspaceId, inboxTeamId],
      parsedInput,
    } = props

    return await inboxTeamService.removeMembers(
      { workspaceId, inboxTeamId },
      parsedInput.ids,
    )
  })
