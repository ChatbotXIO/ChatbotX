"use server"

import { miniAppService } from "@chatbotx.io/business/mini-app"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { createMiniAppRequest } from "../schema/action"

export const createMiniAppAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createMiniAppRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    try {
      const miniApp = await miniAppService.create({
        workspaceId,
        ...parsedInput,
      })
      return { id: miniApp.id }
    } catch (error) {
      if (isValidationException(error) && error.field === "name") {
        return returnValidationErrors(createMiniAppRequest, {
          name: { _errors: [error.message] },
        })
      }
      throw error
    }
  })
