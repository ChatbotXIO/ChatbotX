"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"

export const disconnectWhatsappAction = authActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      await prisma.$transaction(async (tx) => {
        await tx.integrationWhatsapp.delete({
          where: { chatbotId, id },
        })
      })

      return
    },
  )
