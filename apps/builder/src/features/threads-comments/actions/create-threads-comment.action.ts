"use server"

import { fbCommentAutomationService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas/index"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateThreadsCommentRequest,
  createThreadsCommentRequest,
} from "../schema/action"

export const createThreadsCommentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createThreadsCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateThreadsCommentRequest
    }) => {
      const record = await fbCommentAutomationService.createThreadsAutomation({
        workspaceId,
        data: parsedInput,
      })
      return { id: record.id }
    },
  )
