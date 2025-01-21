"use server"

import {
  type ChatbotBindSchema,
  chatbotBindSchema,
} from "@/features/chatbots/schemas/handle-resource-schema"
import {
  type UnblockContactSchema,
  unblockContactSchema,
} from "@/features/conversations/schemas/unblock-contact-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { unblockContactService } from "@/services/conversation.service"
import { type User, prisma } from "@ahachat.ai/database"
import { returnValidationErrors } from "next-safe-action"

export const unblockContactAction = authActionClient
  .schema(unblockContactSchema)
  .bindArgsSchemas(chatbotBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: UnblockContactSchema
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
        return returnValidationErrors(unblockContactSchema, {
          _errors: ["Validation Exception"],
          ids: {
            _errors: [
              "Conversation not exists on chatbot or conversation unarchived before.",
            ],
          },
        })
      }

      await unblockContactService(conversations)

      return {
        successful: true,
      }
    },
  )
