"use server"

import { miniAppService } from "@chatbotx.io/business/mini-app"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { returnNameTakenError } from "../lib/name-taken"
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
      return returnNameTakenError(createMiniAppRequest, error)
    }
  })
