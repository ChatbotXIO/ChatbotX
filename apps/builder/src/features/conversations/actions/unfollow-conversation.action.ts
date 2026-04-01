"use server"

import { conversationTrackingService } from "@chatbotx.io/analytics"
import { and, db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const unfollowConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const conversation = await db.query.conversationModel.findFirst({
        where: {
          id,
          chatbotId,
        },
        columns: {
          id: true,
          channel: true,
        },
      })

      if (!conversation) {
        throw new Error("Conversation not found")
      }

      await db
        .update(conversationModel)
        .set({
          followed: false,
        })
        .where(
          and(
            eq(conversationModel.id, id),
            eq(conversationModel.chatbotId, chatbotId),
          ),
        )

      await conversationTrackingService.trackEvent(
        {
          chatbotId,
          conversationId: conversation.id,
          eventType: "conversation_unfollowed",
          eventId: createId(),
          channel: conversation.channel,
          occurredAt: new Date(),
          metadata: {
            triggerContext: {
              triggerSource: "api",
              triggerHandler: "unfollowConversationAction",
              triggerType: "conversation_unfollowed",
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
