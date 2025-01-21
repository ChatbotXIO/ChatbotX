"use server"

import {
  type ChatbotBindSchema,
  chatbotBindSchema,
} from "@/features/chatbots/schemas/handle-resource-schema"
import {
  type UnarchiveConversationSchema,
  unarchiveConversationSchema,
} from "@/features/conversations/schemas/unarchive-conversation-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { unarchiveConversationService } from "@/services/conversation.service"
import { type User, prisma } from "@ahachat.ai/database"

export const unarchiveConversationAction = authActionClient
  .schema(unarchiveConversationSchema)
  .bindArgsSchemas(chatbotBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: UnarchiveConversationSchema
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
        throw new Error(
          "Conversation not exists on chatbot or conversation unarchived before.",
        )
      }
      await unarchiveConversationService(conversations)

      return {
        successful: true,
      }
    },
  )
