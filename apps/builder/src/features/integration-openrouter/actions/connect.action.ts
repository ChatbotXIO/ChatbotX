"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { integrationOpenRouterService } from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { verifyOpenRouterApiKey } from "../lib"
import {
  type ConnectOpenRouterSchema,
  connectOpenRouterSchema,
} from "../schemas/request"

export const connectOpenRouterAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectOpenRouterSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: ConnectOpenRouterSchema
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const t = await getTranslations()

      if (!(await verifyOpenRouterApiKey(parsedInput.apiKey))) {
        return returnValidationErrors(connectOpenRouterSchema, {
          apiKey: {
            _errors: [t("validation.invalidApiKey")],
          },
        })
      }

      await integrationOpenRouterService.connect({
        workspaceId,
        apiKey: parsedInput.apiKey,
        model: parsedInput.model,
        temperature: parsedInput.temperature,
        maxOutputTokens: parsedInput.maxOutputTokens,
      })

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.openrouter,
      )

      return
    },
  )
