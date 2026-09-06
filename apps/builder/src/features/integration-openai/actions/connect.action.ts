"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { integrationOpenAIService } from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { authActionClient } from "@/lib/safe-action"
import { verifyOpenAIApiKey } from "../lib"
import {
  type ConnectOpenAISchema,
  connectOpenAISchema,
} from "../schema/request"

export const connectOpenAIAction = authActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectOpenAISchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: ConnectOpenAISchema
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const t = await getTranslations()

      if (!(await verifyOpenAIApiKey(parsedInput.apiKey))) {
        return returnValidationErrors(connectOpenAISchema, {
          apiKey: {
            _errors: [t("validation.invalidApiKey")],
          },
        })
      }

      await integrationOpenAIService.connect({
        workspaceId,
        apiKey: parsedInput.apiKey,
        model: parsedInput.model,
        temperature: parsedInput.temperature,
        maxOutputTokens: parsedInput.maxOutputTokens,
      })

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.openai,
      )

      return
    },
  )
