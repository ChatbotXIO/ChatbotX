"use server"
import { aiProviders } from "@chatbotx.io/ai/schemas"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationGeminiModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { verifyGeminiApiKey } from "../lib"
import {
  type ConnectGeminiRequest,
  connectGeminiRequest,
} from "../schemas/request"

export const connectGeminiAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectGeminiRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: ConnectGeminiRequest
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const t = await getTranslations()

      if (!(await verifyGeminiApiKey(parsedInput.apiKey))) {
        return returnValidationErrors(connectGeminiRequest, {
          apiKey: {
            _errors: [t("validation.invalidApiKey")],
          },
        })
      }

      const integrationGemini = await db.query.integrationGeminiModel.findFirst(
        {
          where: {
            workspaceId,
          },
        },
      )

      await db.transaction(async (tx) => {
        if (integrationGemini) {
          await tx
            .update(integrationGeminiModel)
            .set({
              model: parsedInput.model,
              auth: {
                authType: AuthType.secretText,
                secretText: parsedInput.apiKey,
              } as SecretTextAuthValue,
              temperature: parsedInput.temperature,
              maxOutputTokens: parsedInput.maxOutputTokens,
            })
            .where(eq(integrationGeminiModel.id, integrationGemini.id))
        } else {
          const integration = await tx
            .insert(integrationModel)
            .values({
              workspaceId,
              integrationType: "gemini",
              id: createId(),
            })
            .returning()
            .then((result) => result[0])

          await tx.insert(integrationGeminiModel).values({
            workspaceId,
            model: parsedInput.model,
            auth: {
              authType: AuthType.secretText,
              secretText: parsedInput.apiKey,
            } as SecretTextAuthValue,
            temperature: parsedInput.temperature,
            maxOutputTokens: parsedInput.maxOutputTokens,
            id: createId(),
            integrationId: integration.id,
          })
        }
      })

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.gemini,
      )

      return
    },
  )
