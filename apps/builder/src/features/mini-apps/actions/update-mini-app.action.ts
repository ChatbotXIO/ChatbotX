"use server"

import { miniAppService } from "@chatbotx.io/business/mini-app"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { returnNameTakenError } from "../lib/name-taken"
import { updateMiniAppRequest } from "../schema/action"

export const updateMiniAppAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateMiniAppRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    try {
      await miniAppService.update({ workspaceId, id }, parsedInput)
    } catch (error) {
      return returnNameTakenError(updateMiniAppRequest, error)
    }
  })
