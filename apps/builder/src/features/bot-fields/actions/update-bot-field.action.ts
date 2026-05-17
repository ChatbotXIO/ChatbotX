"use server"

import { botFieldService } from "@chatbotx.io/business"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateBotFieldRequest,
  updateBotFieldRequest,
} from "../schemas/action"

export const updateBotFieldAction = workspaceActionClient
  .inputSchema(updateBotFieldRequest)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      parsedInput: UpdateBotFieldRequest
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) =>
      await botFieldService.updateByKey({
        workspaceId,
        key: id,
        data: parsedInput,
      }),
  )
