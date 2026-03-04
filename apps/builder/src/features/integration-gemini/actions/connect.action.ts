"use server"

import { db, eq } from "@aha.chat/database/client"
import {
  integrationGeminiModel,
  integrationModel,
} from "@aha.chat/database/schema"
import { AuthType, type SecretTextAuthValue } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { verifyGeminiApiKey } from "../lib"
import {
  type ConnectGeminiRequest,
  connectGeminiRequest,
} from "../schemas/request"

export const connectGeminiAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectGeminiRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectGeminiRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      if (!(await verifyGeminiApiKey(parsedInput.apiKey))) {
        return returnValidationErrors(connectGeminiRequest, {
          apiKey: {
            _errors: ["Invalid API key"],
          },
        })
      }

      const integrationGemini = await db.query.integrationGeminiModel.findFirst(
        {
          where: {
            chatbotId,
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
              chatbotId,
              integrationType: "gemini",
              id: createId(),
            })
            .returning()
            .then((result) => result[0])

          await tx.insert(integrationGeminiModel).values({
            chatbotId,
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

      return
    },
  )
