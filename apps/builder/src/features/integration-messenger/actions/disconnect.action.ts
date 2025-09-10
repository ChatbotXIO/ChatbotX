"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectMessengerAction = chatbotActionClient
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
      revalidateTag(`chatbots:${chatbotId}#messengerAuthValue`)
      return
    },
  )
