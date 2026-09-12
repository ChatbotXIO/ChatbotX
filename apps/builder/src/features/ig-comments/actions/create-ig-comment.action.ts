"use server"

import { fbCommentAutomationService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateIgCommentRequest,
  createIgCommentRequest,
} from "../schema/action"

export const createIgCommentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createIgCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateIgCommentRequest
    }) => {
      const { type, ...data } = parsedInput
      const record = await fbCommentAutomationService.createInstagram({
        workspaceId,
        type,
        data,
      })
      return { id: record.id }
    },
  )
