"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { integrationOpenRouterService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateOpenRouterRequest,
  updateOpenRouterRequest,
} from "../schemas/request"

export const updateIntegrationOpenRouterAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateOpenRouterRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: UpdateOpenRouterRequest
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      await integrationOpenRouterService.update(workspaceId, parsedInput)

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.openrouter,
      )
    },
  )
