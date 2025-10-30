"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { AuthType, type SecretTextAuthValue } from "@aha.chat/sdk"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { openAIModels } from "@/features/openai/models"
import { authActionClient } from "@/lib/safe-action"
import { type ConnectOpenAISchema, connectOpenAISchema } from "../schemas"

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
      const integrationOpenAI = await prisma.integrationOpenAI.findFirst({
        where: {
          chatbotId,
        },
      })

      await prisma.$transaction(async (tx) => {
        if (integrationOpenAI) {
          await tx.integrationOpenAI.update({
            where: { id: integrationOpenAI.id },
            data: {
              model: openAIModels.GPT4oMini,
              auth: {
                authType: AuthType.secretText,
                secretText: parsedInput.apiKey,
              } as SecretTextAuthValue,
              temperature: parsedInput.temperature,
              maxTokens: parsedInput.maxTokens,
            },
          })
        } else {
          await tx.integration.create({
            data: {
              chatbotId,
              integrationType: IntegrationType.OpenAI,
              openAI: {
                create: {
                  chatbotId,
                  model: openAIModels.GPT4oMini,
                  auth: {
                    authType: AuthType.secretText,
                    secretText: parsedInput.apiKey,
                  } as SecretTextAuthValue,
                  temperature: parsedInput.temperature,
                  maxTokens: parsedInput.maxTokens,
                },
              },
            },
          })
        }
      })

      return
    },
  )
