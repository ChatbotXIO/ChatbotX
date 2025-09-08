"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { authActionClient } from "@/lib/safe-action"

export const disconnectMessengerAction = authActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationMessenger =
        await prisma.integrationMessenger.findFirstOrThrow({
          where: { chatbotId },
        })

      await prisma.$transaction(async (tx) => {
        await tx.inbox.delete({
          where: { id: integrationMessenger.inboxId },
        })
      })
      return
    },
  )
