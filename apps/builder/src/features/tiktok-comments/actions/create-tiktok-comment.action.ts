"use server"

import { fbCommentAutomationService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateTiktokCommentRequest,
  createTiktokCommentRequest,
} from "../schema/action"

export const createTiktokCommentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createTiktokCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateTiktokCommentRequest
    }) => {
      const record = await fbCommentAutomationService.createTiktokAutomation({
        workspaceId,
        data: parsedInput,
      })
      return { id: record.id }
    },
  )
