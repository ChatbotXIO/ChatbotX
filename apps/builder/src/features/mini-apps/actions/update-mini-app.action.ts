"use server"

import { miniAppService } from "@chatbotx.io/business/mini-app"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateMiniAppRequest } from "../schema/action"

export const updateMiniAppAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateMiniAppRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    try {
      await miniAppService.update({ workspaceId, id }, parsedInput)
    } catch (error) {
      if (isValidationException(error) && error.field === "name") {
        return returnValidationErrors(updateMiniAppRequest, {
          name: { _errors: [error.message] },
        })
      }
      throw error
    }
  })
