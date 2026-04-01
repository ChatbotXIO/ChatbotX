"use server"

import { emitConversationTransferredToHuman } from "@chatbotx/events"
import { conversationTrackingService } from "@chatbotx.io/analytics"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const disableBotAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
      ctx,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
      ctx: { user: UserModel }
    }) => {
      // Get conversations before updating to emit events
      const conversations = await db.query.conversationModel.findMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
        columns: {
          id: true,
          contactId: true,
          channel: true,
        },
      })

      await db
        .update(conversationModel)
        .set({
          liveChatEnabled: true,
        })
        .where(
          and(
            eq(conversationModel.chatbotId, chatbotId),
            inArray(conversationModel.id, parsedInput.ids),
          ),
        )

      // Emit conversation transferred to human events
      for (const conv of conversations) {
        try {
          await emitConversationTransferredToHuman(
            chatbotId,
            conv.contactId,
            conv.id,
            ctx.user.id,
          )
        } catch (error) {
          console.error(
            "Failed to emit conversationTransferredToHuman event:",
            error,
          )
        }
      }

      for (const conv of conversations) {
        await conversationTrackingService.trackEvent(
          {
            chatbotId,
            conversationId: conv.id,
            eventType: "conversation_transferred_to_human",
            eventId: createId(),
            channel: conv.channel,
            occurredAt: new Date(),
            metadata: {
              triggerContext: {
                triggerSource: "api",
                triggerHandler: "disableBotAction",
                triggerType: "conversation_transferred_to_human",
              },
            },
          },
          { skipSpooler: true },
        )
      }

      revalidateCacheTags(`chatbots:${chatbotId}#conversations`)
    },
  )
