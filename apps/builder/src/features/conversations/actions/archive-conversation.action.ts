"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { emitConversationArchived } from "@chatbotx.io/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const archiveConversationAction = chatbotActionClient
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
      // Get conversations before archiving to emit events
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
        },
      })

      await db
        .update(conversationModel)
        .set({
          archivedAt: new Date(),
        })
        .where(
          and(
            eq(conversationModel.chatbotId, chatbotId),
            inArray(conversationModel.id, parsedInput.ids),
          ),
        )

      // Emit conversation archived events
      for (const conv of conversations) {
        try {
          await emitConversationArchived(
            chatbotId,
            conv.contactId,
            conv.id,
            ctx.user.id,
          )
        } catch (error) {
          console.error("Failed to emit conversationArchived event:", error)
        }
      }

      revalidateCacheTags(`chatbots:${chatbotId}#conversations`)
    },
  )
