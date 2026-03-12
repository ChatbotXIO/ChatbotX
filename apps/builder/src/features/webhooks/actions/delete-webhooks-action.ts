"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { webhookModel } from "@aha.chat/database/schema"
import { removeWebhookCache } from "@aha.chat/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteWebhooksAction = chatbotActionClient
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
      await db
        .delete(webhookModel)
        .where(
          and(
            eq(webhookModel.chatbotId, chatbotId),
            inArray(webhookModel.id, parsedInput.ids),
          ),
        )

      await removeWebhookCache(chatbotId)
    },
  )
