"use server"

import { IntegrationType, prisma } from "@aha.chat/database"
import { OpenAIModel } from "@aha.chat/flow-config"
import { AuthType, type SecretTextAuthValue } from "@aha.chat/sdk"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
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
              model: OpenAIModel.GPT4oMini,
              auth: {
                authType: AuthType.SECRET_TEXT,
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
              integrationType: IntegrationType.OPENAI,
              openAI: {
                create: {
                  chatbotId,
                  model: OpenAIModel.GPT4oMini,
                  auth: {
                    authType: AuthType.SECRET_TEXT,
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
