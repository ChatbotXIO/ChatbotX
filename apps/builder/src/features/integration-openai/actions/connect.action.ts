"use server"

import {
  type ChatbotIdBindSchema,
  chatbotIdBindSchema,
} from "@/features/chatbots/schemas"
import { authActionClient } from "@/lib/safe-action"
import { IntegrationType, prisma } from "@ahachat.ai/database"
import {
  AuthType,
  IntegrationException,
  type SecretTextAuthValue,
} from "@ahachat.ai/sdk"
import {
  type ConnectOpenAISchema,
  OpenAIModel,
  connectOpenAISchema,
} from "../schemas"

export const connectOpenAIAction = authActionClient
  .bindArgsSchemas(chatbotIdBindSchema)
  .schema(connectOpenAISchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectOpenAISchema
      bindArgsParsedInputs: ChatbotIdBindSchema
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
