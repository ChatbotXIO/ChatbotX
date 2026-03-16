"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { botFieldModel } from "@aha.chat/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteBotFieldsAction = chatbotActionClient
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
        .delete(botFieldModel)
        .where(
          and(
            eq(botFieldModel.chatbotId, chatbotId),
            inArray(botFieldModel.id, parsedInput.ids),
          ),
        )

      revalidateCacheTags([
        `chatbots:${chatbotId}#botFields`,
        ...parsedInput.ids.map((id) => `chatbots:${chatbotId}#botFields:${id}`),
      ])
    },
  )
