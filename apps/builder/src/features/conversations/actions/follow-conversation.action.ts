"use server"

import { emitConversationFollowUp } from "@chatbotx/events"
import { conversationTrackingService } from "@chatbotx.io/analytics"
import { and, db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
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
          channel: true,
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

      await conversationTrackingService.trackEvent(
        {
          chatbotId,
          conversationId: conversation.id,
          eventType: "conversation_followed",
          eventId: createId(),
          channel: conversation.channel,
          occurredAt: new Date(),
          metadata: {
            triggerContext: {
              triggerSource: "api",
              triggerHandler: "followConversationAction",
              triggerType: "conversation_followed",
            },
          },
        },
        { skipSpooler: true },
      )

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
      ])
    },
  )
