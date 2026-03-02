"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { aiTriggerModel } from "@aha.chat/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput: { ids },
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await db
        .delete(aiTriggerModel)
        .where(
          and(
            eq(aiTriggerModel.chatbotId, chatbotId),
            inArray(aiTriggerModel.id, ids),
          ),
        )

      revalidateCacheTags(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
