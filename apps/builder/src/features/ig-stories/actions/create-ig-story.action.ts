"use server"

import { igStoryAutomationService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateIgStoryRequest,
  createIgStoryRequest,
} from "../schema/action"

export const createIgStoryAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createIgStoryRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateIgStoryRequest
    }) => {
      const { type, ...data } = parsedInput
      const record = await igStoryAutomationService.create({
        workspaceId,
        type,
        data,
      })
      return { id: record.id }
    },
  )
