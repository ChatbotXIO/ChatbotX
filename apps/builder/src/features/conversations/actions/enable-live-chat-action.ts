"use server"

import {
  type ChatbotBindSchema,
  chatbotBindSchema,
} from "@/features/chatbots/schemas/handle-resource-schema"
import {
  type EnableLiveChatSchema,
  enableLiveChatSchema,
} from "@/features/conversations/schemas/enable-live-chat-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { enableLiveChatService } from "@/services/conversation.service"
import { type User, prisma } from "@ahachat.ai/database"

export const enableLiveChatAction = authActionClient
  .schema(enableLiveChatSchema)
  .bindArgsSchemas(chatbotBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: EnableLiveChatSchema
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

      await enableLiveChatService(conversations, parsedInput.liveChatEnabled)

      return {
        successful: true,
      }
    },
  )
