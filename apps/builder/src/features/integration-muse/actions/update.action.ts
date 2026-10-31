"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { integrationMuseService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { type UpdateMuseRequest, updateMuseRequest } from "../schema/request"

export const updateIntegrationMuseAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateMuseRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: UpdateMuseRequest
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      await integrationMuseService.update({ workspaceId }, parsedInput)

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.muse,
      )
    },
  )
