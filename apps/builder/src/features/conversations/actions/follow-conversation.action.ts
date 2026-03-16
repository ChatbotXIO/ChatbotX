"use server"

import { and, db, eq } from "@aha.chat/database/client"
import { conversationModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import { emitConversationFollowUp } from "@chatbotx/events"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const followConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      ctx,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      ctx: { user: UserModel }
    }) => {
      // Get conversation before updating to emit event
      const conversation = await db.query.conversationModel.findFirst({
        where: {
          id,
          chatbotId,
        },
        columns: {
          id: true,
          contactId: true,
        },
      })

      if (!conversation) {
        throw new Error("Conversation not found")
      }

      await db
        .update(conversationModel)
        .set({
          followed: true,
        })
        .where(
          and(
            eq(conversationModel.id, id),
            eq(conversationModel.chatbotId, chatbotId),
          ),
        )

      try {
        await emitConversationFollowUp(
          chatbotId,
          conversation.contactId,
          conversation.id,
          ctx.user.id,
        )
      } catch (error) {
        console.error("Failed to emit conversationFollowUp event:", error)
      }

      // Emit conversation follow up event
      try {
        await emitConversationFollowUp(
          chatbotId,
          conversation.contactId,
          conversation.id,
          ctx.user.id,
        )
      } catch (error) {
        console.error("Failed to emit conversationFollowUp event:", error)
      }

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
      ])
    },
  )
