"use server"
import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { integrationClaudeService } from "@chatbotx.io/business"
import { verifyAiProviderApiKey } from "@chatbotx.io/business/integration-ai-provider/verify"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ConnectClaudeSchema,
  connectClaudeSchema,
} from "../schema/request"

export const connectClaudeAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectClaudeSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: ConnectClaudeSchema
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const t = await getTranslations()

      if (
        (await verifyAiProviderApiKey(
          aiProviders.enum.claude,
          parsedInput.apiKey,
        )) === "invalid"
      ) {
        return returnValidationErrors(connectClaudeSchema, {
          apiKey: {
            _errors: [t("validation.invalidApiKey")],
          },
        })
      }

      await integrationClaudeService.connect({
        workspaceId,
        apiKey: parsedInput.apiKey,
        model: parsedInput.model,
        temperature: parsedInput.temperature,
        maxOutputTokens: parsedInput.maxOutputTokens,
      })

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.claude,
      )

      return
    },
  )
