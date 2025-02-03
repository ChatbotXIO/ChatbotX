"use server"

import {
  type ChatbotBindSchema,
  chatbotBindSchema,
} from "@/features/chatbots/schemas/handle-resource-schema"
import {
  type FollowChatSchema,
  followChatSchema,
} from "@/features/conversations/schemas/follow-chat-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { followConversationService } from "@/services/conversation.service"
import { type User, prisma } from "@ahachat.ai/database"

export const followChatAction = authActionClient
  .schema(followChatSchema)
  .bindArgsSchemas(chatbotBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: FollowChatSchema
      bindArgsParsedInputs: ChatbotBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)
      const params = {
        chatbotId: chatbotId,
        id: {
          in: parsedInput.ids,
        },
      }

      const conversations = await prisma.conversation.findMany({
        where: params,
      })
      if (conversations.length !== parsedInput.ids.length) {
        throw new Error("Conversation not exists on chatbot")
      }
      await followConversationService(conversations, parsedInput.followed)

      return {
        successful: true,
      }
    },
  )
