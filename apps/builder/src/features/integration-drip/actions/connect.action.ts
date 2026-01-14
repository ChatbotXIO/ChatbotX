"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { DripClient } from "@aha.chat/integration-drip"
import { AuthType, SdkException } from "@aha.chat/sdk"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { connectDripSchema } from "../schemas"

export const connectDrip = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectDripSchema)
  .action(async ({ ctx, parsedInput }) => {
    const tError = await getTranslations("drip.error")

    try {
      const tempClient = new DripClient({
        apiToken: parsedInput.apiToken,
        accountId: "temp",
        authType: AuthType.secretText,
      })

      const accounts = await tempClient.getAccounts()
      if (!accounts || accounts.length === 0) {
        throw new SdkException(tError("invalidCredentials"))
      }

      const accountId = accounts[0].id

      const client = new DripClient({
        apiToken: parsedInput.apiToken,
        accountId,
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
            integrationType: IntegrationType.drip,
          },
        })

        if (existingIntegration) {
          await tx.integrationDrip.upsert({
            where: { integrationId: existingIntegration.id },
            update: {
              apiToken: parsedInput.apiToken,
              accountId,
            },
            create: {
              chatbotId: ctx.chatbot.id,
              apiToken: parsedInput.apiToken,
              accountId,
              integrationId: existingIntegration.id,
            },
          })
        } else {
          await tx.integration.create({
            data: {
              chatbotId: ctx.chatbot.id,
              integrationType: IntegrationType.drip,
              drip: {
                create: {
                  chatbotId: ctx.chatbot.id,
                  apiToken: parsedInput.apiToken,
                  accountId,
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
