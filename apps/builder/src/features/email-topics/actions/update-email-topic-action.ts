"use server"

import { emailTopicService } from "@chatbotx.io/business"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateEmailTopicRequest,
  updateEmailTopicRequest,
} from "../schema/action"

export const updateEmailTopicAction = workspaceActionClient
  .inputSchema(updateEmailTopicRequest)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      parsedInput: UpdateEmailTopicRequest
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) =>
      emailTopicService.update({
        workspaceId,
        id,
        data: parsedInput,
      }),
  )
