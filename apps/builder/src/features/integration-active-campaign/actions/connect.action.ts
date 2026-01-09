"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { ActiveCampaignClient } from "@aha.chat/integration-active-campaign"
import { AuthType } from "@aha.chat/sdk"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { connectActiveCampaignSchema } from "../schemas"

export const connectActiveCampaign = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectActiveCampaignSchema)
  .action(async ({ ctx, parsedInput }) => {
    const client = new ActiveCampaignClient({
      apiUrl: parsedInput.apiUrl,
      apiKey: parsedInput.apiKey,
      authType: AuthType.secretText,
    })

    const isValid = await client.testConnection()
    if (!isValid) {
      const t = await getTranslations("activeCampaign.error")
      throw new Error(t("invalidCredentials"))
    }

    await prisma.$transaction(async (tx) => {
      // Check if integration already exists
      const existingIntegration = await tx.integration.findFirst({
        where: {
          chatbotId: ctx.chatbot.id,
          integrationType: IntegrationType.activeCampaign,
        },
      })

      if (existingIntegration) {
        await tx.integrationActiveCampaign.update({
          where: { integrationId: existingIntegration.id },
          data: {
            apiUrl: parsedInput.apiUrl,
            apiKey: parsedInput.apiKey,
          },
        })
      } else {
        await tx.integration.create({
          data: {
            chatbotId: ctx.chatbot.id,
            integrationType: IntegrationType.activeCampaign,
            activeCampaign: {
              create: {
                chatbotId: ctx.chatbot.id,
                apiUrl: parsedInput.apiUrl,
                apiKey: parsedInput.apiKey,
              },
            },
          },
        })
      }
    })

    revalidatePath(`/chatbots/${ctx.chatbot.id}/settings/integrations`)
    return { success: true }
  })
