"use server"

import {
  type ArchiveConversationBindSchema,
  type ArchiveConversationSchema,
  archiveConversationBindSchema,
  archiveConversationSchema,
} from "@/features/conversations/schemas/archive-conversation-schema"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { returnValidationErrors } from "next-safe-action"
import { revalidateTag } from "next/cache"

export const archiveConversationAction = authActionClient
  .schema(archiveConversationSchema)
  .bindArgsSchemas(archiveConversationBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: ArchiveConversationSchema
      bindArgsParsedInputs: ArchiveConversationBindSchema
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
        return returnValidationErrors(archiveConversationSchema, {
          _errors: ["Validation Exception"],
          ids: {
            _errors: [
              "Conversation not exists on chatbot or conversation archived before.",
            ],
          },
        })
      }
      const data = { archivedAt: new Date() }

      await prisma.conversation.updateMany({
        where: {
          ...params,
          archivedAt: null,
        },
        data,
      })
      for (const id of parsedInput.ids) {
        revalidateTag(`conversations#${id}`)
      }

      return {
        successful: true,
        data,
      }
    },
  )
