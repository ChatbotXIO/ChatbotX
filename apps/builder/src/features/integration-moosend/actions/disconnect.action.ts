"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationType } from "@aha.chat/database/types"
import { revalidatePath } from "next/cache"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectMoosend = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(async ({ ctx: { chatbot } }) => {
    await prisma.integration.deleteMany({
      where: {
        chatbotId: chatbot.id,
        integrationType: IntegrationType.moosend,
      },
    })

    revalidatePath(`/chatbots/${chatbot.id}/settings/integrations`)
    return { success: true }
  })
