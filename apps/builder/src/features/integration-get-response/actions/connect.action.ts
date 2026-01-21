"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { GetResponseClient } from "@aha.chat/integration-get-response"
import { AuthType, SdkException } from "@aha.chat/sdk"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { connectGetResponseSchema } from "../schemas"

export const connectGetResponse = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectGetResponseSchema)
  .action(async ({ ctx, parsedInput }) => {
    const tError = await getTranslations("getResponse.error")

    try {
      const client = new GetResponseClient({
        apiKey: parsedInput.apiKey,
        authType: AuthType.secretText,
      })

      const isValid = await client.testConnection()
      if (!isValid) {
        throw new SdkException(tError("invalidCredentials"))
      }

      await prisma.$transaction(async (tx) => {
        const existingIntegration = await tx.integration.findFirst({
          where: {
            chatbotId: ctx.chatbot.id,
            integrationType: IntegrationType.getResponse,
          },
        })

        if (existingIntegration) {
          await tx.integrationGetResponse.upsert({
            where: { integrationId: existingIntegration.id },
            update: {
              apiKey: parsedInput.apiKey,
            },
            create: {
              chatbotId: ctx.chatbot.id,
              apiKey: parsedInput.apiKey,
              integrationId: existingIntegration.id,
            },
          })
        } else {
          await tx.integration.create({
            data: {
              chatbotId: ctx.chatbot.id,
              integrationType: IntegrationType.getResponse,
              getResponse: {
                create: {
                  chatbotId: ctx.chatbot.id,
                  apiKey: parsedInput.apiKey,
                },
              },
            },
          })
        }
      })

      revalidatePath(`/chatbots/${ctx.chatbot.id}/settings/integrations`)
      return { success: true }
    } catch (error) {
      if (error instanceof SdkException) {
        throw error
      }

      throw new SdkException(
        error instanceof Error ? error.message : tError("connectionFailed"),
      )
    }
  })
