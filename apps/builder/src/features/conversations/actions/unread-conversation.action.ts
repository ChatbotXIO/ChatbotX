"use server"

import { MessageType, prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const unreadConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      return await prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.findFirstOrThrow({
          where: { id, chatbotId },
        })
        const last2Messages = await tx.message.findMany({
          where: {
            conversationId: conversation.id,
            messageType: MessageType.incoming,
          },
          orderBy: { createdAt: "desc" },
          take: 2,
        })
        const lastMessage = last2Messages.at(-1)

        const agentLastSeenAt = lastMessage ? lastMessage.createdAt : null

        await tx.conversation.update({
          where: { id },
          data: {
            agentLastSeenAt,
          },
        })

        return { agentLastSeenAt }
      })
    },
  )
