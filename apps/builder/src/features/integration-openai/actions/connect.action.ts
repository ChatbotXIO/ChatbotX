"use server"

import { aiProviders, openaiModels } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq } from "@chatbotx.io/database/client"
import {
  integrationModel,
  integrationOpenaiModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"
import { verifyOpenAIApiKey } from "../lib"
import {
  type ConnectOpenAISchema,
  connectOpenAISchema,
} from "../schemas/request"

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

      const integrationOpenAI = await db.query.integrationOpenaiModel.findFirst(
        {
          where: {
            workspaceId,
          },
        },
      )

      await db.transaction(async (tx) => {
        if (integrationOpenAI) {
          await tx
            .update(integrationOpenaiModel)
            .set({
              model: openaiModels.enum["gpt-4o-mini"],
              auth: {
                authType: AuthType.secretText,
                secretText: parsedInput.apiKey,
              } as SecretTextAuthValue,
              temperature: parsedInput.temperature,
              maxOutputTokens: parsedInput.maxOutputTokens,
            })
            .where(eq(integrationOpenaiModel.id, integrationOpenAI.id))
        } else {
          const integration = await tx
            .insert(integrationModel)
            .values({
              id: createId(),
              workspaceId,
              integrationType: "openai",
            })
            .returning()
            .then((result) => result[0])

          await tx.insert(integrationOpenaiModel).values({
            id: createId(),
            integrationId: integration.id,
            workspaceId,
            model: openaiModels.enum["gpt-4o-mini"],
            auth: {
              authType: AuthType.secretText,
              secretText: parsedInput.apiKey,
            } as SecretTextAuthValue,
            temperature: parsedInput.temperature,
            maxOutputTokens: parsedInput.maxOutputTokens,
          })
        }
      })

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.openai,
      )

      return
    },
  )
