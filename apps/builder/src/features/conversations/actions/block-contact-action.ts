"use server"

import {
  type ChatbotBindSchema,
  chatbotBindSchema,
} from "@/features/chatbots/schemas/handle-resource-schema"
import {
  type BlockContactSchema,
  blockContactSchema,
} from "@/features/conversations/schemas/block-contact-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { blockContactService } from "@/services/conversation.service"
import { type User, prisma } from "@ahachat.ai/database"

export const blockContactAction = authActionClient
  .schema(blockContactSchema)
  .bindArgsSchemas(chatbotBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: BlockContactSchema
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
          "Conversation not exists on chatbot or conversation archived before.",
        )
      }
      await blockContactService(conversations)

      return {
        successful: true,
      }
    },
  )
