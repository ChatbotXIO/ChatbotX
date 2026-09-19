"use server"

import { commentAutomationService } from "@chatbotx.io/business"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateThreadsCommentRequest,
  updateThreadsCommentRequest,
} from "../schema/action"

export const updateThreadsCommentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateThreadsCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
      parsedInput: UpdateThreadsCommentRequest
    }) => {
      await commentAutomationService.updateThreadsAutomation({
        workspaceId,
        id,
        data: parsedInput,
      })
    },
  )
