"use server"

import {
  type ChatbotIdBindSchema,
  chatbotIdBindSchema,
} from "@/features/chatbots/schemas"
import { authActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"

export const disconnectWhatsappAction = authActionClient
  .bindArgsSchemas(chatbotIdBindSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdBindSchema
    }) => {
      const integrationWhatsapp =
        await prisma.integrationWhatsapp.findFirstOrThrow({
          where: { chatbotId },
        })

      await prisma.$transaction(async (tx) => {
        await tx.inbox.delete({
          where: { id: integrationWhatsapp.inboxId },
        })
      })
      return
    },
  )
