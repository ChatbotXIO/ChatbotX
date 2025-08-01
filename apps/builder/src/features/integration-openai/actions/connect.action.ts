"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"
import { IntegrationType, prisma } from "@aha.chat/database"
import {
  AuthType,
  IntegrationException,
  type SecretTextAuthValue,
} from "@aha.chat/sdk"
import { type ConnectOpenAISchema, connectOpenAISchema } from "../schemas"
import { OpenAIModel } from "@aha.chat/flow-config"

export const connectOpenAIAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
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
      if (integrationOpenAI) {
        throw new IntegrationException(
          "OpenAI integration is already connected",
        )
      }

      await prisma.$transaction(async (tx) => {
        const integrationOpenAI = await tx.integrationOpenAI.findFirst({
          where: {
            chatbotId,
          },
        })
        if (integrationOpenAI) {
          throw new IntegrationException(
            "OpenAI integration is already connected",
          )
        }

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
                automatedResponse: false,
                temperature: parsedInput.temperature,
                maxTokens: parsedInput.maxTokens,
              },
            },
          },
        })
      })

      return
    },
  )
