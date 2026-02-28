"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { AuthType, type SecretTextAuthValue } from "@aha.chat/sdk"
import { claudeModels } from "@/features/claude/models"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"
import {
  type ConnectClaudeSchema,
  connectClaudeSchema,
} from "../schemas/request"

export const connectClaudeAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectClaudeSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: ConnectClaudeSchema
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationClaude = await prisma.integrationClaude.findFirst({
        where: {
          chatbotId,
        },
      })

      await prisma.$transaction(async (tx) => {
        if (integrationClaude) {
          await tx.integrationClaude.update({
            where: { id: integrationClaude.id },
            data: {
              model: claudeModels.claude35Sonnet,
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
              integrationType: IntegrationType.claude,
              claude: {
                create: {
                  chatbotId,
                  model: claudeModels.claude35Sonnet,
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
