"use server"

import { emailTopicService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateEmailTopicRequest,
  createEmailTopicRequest,
} from "../schema/action"

export const createEmailTopicAction = workspaceActionClient
  .inputSchema(createEmailTopicRequest)
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: CreateEmailTopicRequest
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) =>
      emailTopicService.create({
        workspaceId,
        data: parsedInput,
      }),
  )
