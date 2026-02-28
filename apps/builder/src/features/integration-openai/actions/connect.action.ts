"use server"

import { db, eq } from "@aha.chat/database/client"
import {
  integrationModel,
  integrationOpenAIModel,
} from "@aha.chat/database/schema"
import { AuthType, type SecretTextAuthValue } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { openaiModels } from "@/features/openai/models"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectOpenAISchema,
  connectOpenAISchema,
} from "../schemas/request"

export const connectOpenAIAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectOpenAISchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectOpenAISchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationOpenAI = await db.query.integrationOpenAIModel.findFirst(
        {
          where: {
            chatbotId,
          },
        },
      )

      await db.transaction(async (tx) => {
        if (integrationOpenAI) {
          await tx
            .update(integrationOpenAIModel)
            .set({
              model: openaiModels.gpt4oMini,
              auth: {
                authType: AuthType.secretText,
                secretText: parsedInput.apiKey,
              } as SecretTextAuthValue,
              temperature: parsedInput.temperature,
              maxOutputTokens: parsedInput.maxOutputTokens,
            })
            .where(eq(integrationOpenAIModel.id, integrationOpenAI.id))
        } else {
          const integration = await tx
            .insert(integrationModel)
            .values({
              id: createId(),
              chatbotId,
              integrationType: "openai",
            })
            .returning()
            .then((result) => result[0])

          await tx.insert(integrationOpenAIModel).values({
            id: createId(),
            integrationId: integration.id,
            chatbotId,
            model: openaiModels.gpt4oMini,
            auth: {
              authType: AuthType.secretText,
              secretText: parsedInput.apiKey,
            } as SecretTextAuthValue,
            temperature: parsedInput.temperature,
            maxOutputTokens: parsedInput.maxOutputTokens,
          })
        }
      })

      return
    },
  )
