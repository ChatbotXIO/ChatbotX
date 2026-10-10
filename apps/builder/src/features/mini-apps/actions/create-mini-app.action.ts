"use server"

import { miniAppService } from "@chatbotx.io/business/mini-app"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { createTranslatedStarterDefinition } from "../lib/starter-definition"
import { createMiniAppRequest } from "../schema/action"

export const createMiniAppAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createMiniAppRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const definition = await createTranslatedStarterDefinition()
    try {
      const miniApp = await miniAppService.create({
        workspaceId,
        name: parsedInput.name,
        definition,
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
