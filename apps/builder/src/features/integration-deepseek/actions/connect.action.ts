"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { AuthType, type SecretTextAuthValue } from "@aha.chat/sdk"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { deepseekModels } from "@/features/deepseek/models"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectDeepSeekSchema,
  connectDeepSeekSchema,
} from "../schemas/request"

export const connectDeepSeekAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectDeepSeekSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectDeepSeekSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationDeepSeek = await prisma.integrationDeepSeek.findFirst({
        where: {
          chatbotId,
        },
      })

      await prisma.$transaction(async (tx) => {
        if (integrationDeepSeek) {
          await tx.integrationDeepSeek.update({
            where: { id: integrationDeepSeek.id },
            data: {
              model: deepseekModels.deepseekChat,
              auth: {
                authType: AuthType.secretText,
                secretText: parsedInput.apiKey,
              } as SecretTextAuthValue,
              temperature: parsedInput.temperature,
              maxOutputTokens: parsedInput.maxOutputTokens,
            },
          })
        } else {
          await tx.integration.create({
            data: {
              chatbotId,
              integrationType: IntegrationType.deepseek,
              deepseek: {
                create: {
                  chatbotId,
                  model: deepseekModels.deepseekChat,
                  auth: {
                    authType: AuthType.secretText,
                    secretText: parsedInput.apiKey,
                  } as SecretTextAuthValue,
                  temperature: parsedInput.temperature,
                  maxOutputTokens: parsedInput.maxOutputTokens,
                },
              },
            },
          })
        }
      })

      return
    },
  )
