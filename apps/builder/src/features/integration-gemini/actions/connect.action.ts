"use server"

import { IntegrationType, prisma } from "@aha.chat/database"
import { AuthType, type SecretTextAuthValue } from "@aha.chat/sdk"
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
      const integrationGemini = await prisma.integrationGemini.findFirst({
        where: {
          chatbotId,
        },
      })

      if (!(await verifyGeminiApiKey(parsedInput.apiKey))) {
        return returnValidationErrors(connectGeminiRequest, {
          apiKey: {
            _errors: ["Invalid API key"],
          },
        })
      }

      await prisma.$transaction(async (tx) => {
        if (integrationGemini) {
          await tx.integrationGemini.update({
            where: { id: integrationGemini.id },
            data: {
              model: parsedInput.model,
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
              integrationType: IntegrationType.gemini,
              integrationGemini: {
                create: {
                  chatbotId,
                  model: parsedInput.model,
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
