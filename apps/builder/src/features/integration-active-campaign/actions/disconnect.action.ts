"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { revalidatePath } from "next/cache"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectActiveCampaign = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(async ({ ctx }) => {
    await prisma.integration.deleteMany({
      where: {
        chatbotId: ctx.chatbot.id,
        integrationType: IntegrationType.activeCampaign,
      },
    })

    revalidatePath(`/chatbots/${ctx.chatbot.id}/settings/integrations`)
    return { success: true }
  })
