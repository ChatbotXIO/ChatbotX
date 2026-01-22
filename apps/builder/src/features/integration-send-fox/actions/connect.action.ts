"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { SendFoxClient } from "@aha.chat/integration-send-fox"
import { AuthType, SdkException } from "@aha.chat/sdk"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { connectSendFoxSchema } from "../schemas"

export const connectSendFox = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectSendFoxSchema)
  .action(async ({ ctx, parsedInput }) => {
    const tError = await getTranslations("sendFox.error")

    try {
      const client = new SendFoxClient({
        accessToken: parsedInput.accessToken,
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
            integrationType: IntegrationType.sendFox,
          },
        })

        if (existingIntegration) {
          await tx.integrationSendFox.upsert({
            where: { integrationId: existingIntegration.id },
            update: {
              accessToken: parsedInput.accessToken,
            },
            create: {
              chatbotId: ctx.chatbot.id,
              accessToken: parsedInput.accessToken,
              integrationId: existingIntegration.id,
            },
          })
        } else {
          await tx.integration.create({
            data: {
              chatbotId: ctx.chatbot.id,
              integrationType: IntegrationType.sendFox,
              sendFox: {
                create: {
                  chatbotId: ctx.chatbot.id,
                  accessToken: parsedInput.accessToken,
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
