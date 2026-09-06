"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { integrationDeepSeekService } from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { verifyDeepSeekApiKey } from "../lib"
import {
  type ConnectDeepSeekSchema,
  connectDeepSeekSchema,
} from "../schema/request"

export const connectDeepSeekAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectDeepSeekSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: ConnectDeepSeekSchema
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const t = await getTranslations()

      if (!(await verifyDeepSeekApiKey(parsedInput.apiKey))) {
        return returnValidationErrors(connectDeepSeekSchema, {
          apiKey: {
            _errors: [t("validation.invalidApiKey")],
          },
        })
      }

      await integrationDeepSeekService.connect({
        workspaceId,
        apiKey: parsedInput.apiKey,
        model: parsedInput.model,
        temperature: parsedInput.temperature,
        maxOutputTokens: parsedInput.maxOutputTokens,
      })

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.deepseek,
      )

      return
    },
  )
