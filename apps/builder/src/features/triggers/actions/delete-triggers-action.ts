"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { triggerModel } from "@aha.chat/database/schema"
import { removeTriggerCache } from "@aha.chat/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteTriggersAction = chatbotActionClient
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
        .delete(triggerModel)
        .where(
          and(
            eq(triggerModel.chatbotId, chatbotId),
            inArray(triggerModel.id, parsedInput.ids),
          ),
        )

      await removeTriggerCache(chatbotId)
    },
  )
