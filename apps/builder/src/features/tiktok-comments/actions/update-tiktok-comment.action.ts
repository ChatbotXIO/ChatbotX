"use server"

import { commentAutomationService } from "@chatbotx.io/business"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateTiktokCommentRequest,
  updateTiktokCommentRequest,
} from "../schema/action"

export const updateTiktokCommentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateTiktokCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
      parsedInput: UpdateTiktokCommentRequest
    }) => {
      await commentAutomationService.updateTiktokAutomation({
        workspaceId,
        id,
        data: parsedInput,
      })
    },
  )
