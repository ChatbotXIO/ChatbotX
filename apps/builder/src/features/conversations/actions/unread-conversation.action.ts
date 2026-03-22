"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { conversationModel } from "@aha.chat/database/schema"
import type { ConversationModel } from "@aha.chat/database/types"
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
      return await db.transaction(async (tx) => {
        const conversation = await findOrFail<ConversationModel>(
          conversationModel,
          { id, chatbotId },
          "Conversation not found",
        )

        const last2Messages = await tx.query.messageModel.findMany({
          where: {
            conversationId: conversation.id,
            messageType: "incoming",
          },
          orderBy: { createdAt: "desc" },
          limit: 2,
        })
        const lastMessage = last2Messages.at(-1)

        const agentLastReadAt = lastMessage ? lastMessage.createdAt : null

        await tx
          .update(conversationModel)
          .set({
            agentLastReadAt,
          })
          .where(eq(conversationModel.id, id))

        return { agentLastReadAt }
      })
    },
  )
