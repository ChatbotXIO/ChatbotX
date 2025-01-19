"use server"

import {
  type EnableLiveChatBindSchema,
  type EnableLiveChatSchema,
  enableLiveChatBindSchema,
  enableLiveChatSchema,
} from "@/features/conversations/schemas/enable-live-chat-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { returnValidationErrors } from "next-safe-action"
import { revalidateTag } from "next/cache"

export const enableLiveChatAction = authActionClient
  .schema(enableLiveChatSchema)
  .bindArgsSchemas(enableLiveChatBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: EnableLiveChatSchema
      bindArgsParsedInputs: EnableLiveChatBindSchema
    }) => {
      console.log("parsedInput", parsedInput)
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
        return returnValidationErrors(enableLiveChatSchema, {
          _errors: ["Validation Exception"],
          ids: {
            _errors: ["Conversation not exists on chatbot"],
          },
        })
      }

      await prisma.conversation.updateMany({
        where: params,
        data: { liveChatEnabled: parsedInput.liveChatEnabled },
      })
      for (const id of parsedInput.ids) {
        revalidateTag(`conversations#${id}`)
      }

      return {
        successful: true,
      }
    },
  )
