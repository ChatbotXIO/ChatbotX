"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { KlaviyoClient } from "@aha.chat/integration-klaviyo"
import { AuthType, SdkException } from "@aha.chat/sdk"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { connectKlaviyoSchema } from "../schemas"

export const connectKlaviyo = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectKlaviyoSchema)
  .action(async ({ ctx, parsedInput }) => {
    const tError = await getTranslations("klaviyo.error")

    try {
      const client = new KlaviyoClient({
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
            integrationType: IntegrationType.klaviyo,
          },
        })

        if (existingIntegration) {
          await tx.integrationKlaviyo.upsert({
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
              integrationType: IntegrationType.klaviyo,
              klaviyo: {
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
