"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { chatbotActionClient } from "@/lib/safe-action"

export const unreadConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      await assertCurrentUserCanAccessChatbot(chatbotId)

      await prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.findUniqueOrThrow({
          where: { id },
          include: { messages: true },
        })
        const lastMessage = conversation.messages.at(-1)

        await tx.conversation.update({
          where: { id },
          data: {
            agentLastSeenAt: lastMessage ? lastMessage.createdAt : null,
          },
        })
      })
    },
  )
