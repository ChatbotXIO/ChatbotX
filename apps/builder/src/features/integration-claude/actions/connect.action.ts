"use server"
import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { verifyAiProviderApiKey } from "@chatbotx.io/business/integration-ai-provider/verify"
import { connectionService } from "@chatbotx.io/connections"
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

      // `allowUpdate: true` mirrors the legacy `integrationClaudeService.connect`
      // this replaces — that always upserted (replacing an already-connected
      // workspace's stored API key/config), never rejecting a repeat connect —
      // see `ai.ts`'s `connectAiProvider` handler for the same contract.
      await connectionService.connectFromCredentials({
        workspaceId,
        provider: aiProviders.enum.claude,
        config: {
          apiKey: parsedInput.apiKey,
          model: parsedInput.model,
          temperature: parsedInput.temperature,
          maxOutputTokens: parsedInput.maxOutputTokens,
        },
        allowUpdate: true,
      })

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.claude,
      )

      return
    },
  )
