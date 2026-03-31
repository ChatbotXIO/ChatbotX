"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { conversationModel } from "@aha.chat/database/schema"
import { conversationTrackingService } from "@chatbotx.io/analytics"
import { createId } from "@chatbotx.io/utils"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const unarchiveConversationAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      const conversations = await db.query.conversationModel.findMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
        columns: {
          id: true,
          channel: true,
        },
      })

      await db
        .update(conversationModel)
        .set({
          archivedAt: null,
        })
        .where(
          and(
            eq(conversationModel.chatbotId, chatbotId),
            inArray(conversationModel.id, parsedInput.ids),
          ),
        )

      for (const conv of conversations) {
        await conversationTrackingService.trackEvent(
          {
            chatbotId,
            conversationId: conv.id,
            eventType: "conversation_unarchived",
            eventId: createId(),
            channel: conv.channel,
            occurredAt: new Date(),
            metadata: {
              triggerContext: {
                triggerSource: "api",
                triggerHandler: "unarchiveConversationAction",
                triggerType: "conversation_unarchived",
              },
            },
          },
          { skipSpooler: true },
        )
      }

      revalidateCacheTags(`chatbots:${chatbotId}#conversations`)
    },
  )
