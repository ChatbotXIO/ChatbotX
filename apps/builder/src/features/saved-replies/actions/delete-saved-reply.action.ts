"use server"

import { savedReplyService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteSavedReplyAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await savedReplyService.delete({ workspaceId, id })
  })
