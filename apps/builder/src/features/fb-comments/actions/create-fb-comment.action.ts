"use server"

import { fbCommentAutomationService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateFbCommentRequest,
  createFbCommentRequest,
} from "../schema/action"

export const createFbCommentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFbCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateFbCommentRequest
    }) => {
      const record = await fbCommentAutomationService.createMessenger({
        workspaceId,
        data: parsedInput,
      })
      return { id: record.id }
    },
  )
