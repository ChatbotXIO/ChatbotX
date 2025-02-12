"use server"

import {
  type ChatbotIdBindSchema,
  chatbotIdBindSchema,
} from "@/features/chatbots/schemas"
import { authActionClient } from "@/lib/safe-action"
import { IntegrationType, prisma } from "@ahachat.ai/database"
import { integration } from "@ahachat.ai/integration-google-sheets"
import {
  AuthType,
  IntegrationException,
  type SecretTextAuthSchema,
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
      if (!integration.connect) {
        throw new IntegrationException("Integration is not connected")
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

        tx.integration.create({
          data: {
            chatbotId,
            integrationType: IntegrationType.OpenAI,
            openAI: {
              create: {
                chatbotId,
                model: OpenAIModel.GPT4oMini,
                auth: {
                  authType: AuthType.SECRET_TEXT,
                  issuedAt: new Date().toISOString(),
                  secretText: parsedInput.apiKey,
                } as SecretTextAuthSchema,
                automatedResponse: false,
                temperature: parsedInput.temperature ?? 1.0,
                maxTokens: parsedInput.maxTokens ?? 200,
              },
            },
          },
        })
      })

      return
    },
  )
