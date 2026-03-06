"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { fieldModel } from "@aha.chat/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteFieldsAction = chatbotActionClient
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
      await deleteCustomFields({ chatbotId, ids: parsedInput.ids })
    },
  )

export const deleteCustomFields = async ({
  chatbotId,
  ids,
}: {
  chatbotId: string
  ids: string[]
}) => {
  await db
    .delete(fieldModel)
    .where(
      and(
        eq(fieldModel.chatbotId, chatbotId),
        eq(fieldModel.fieldType, "customField"),
        inArray(fieldModel.id, ids),
      ),
    )

  revalidateCacheTags(`chatbots:${chatbotId}#customFields`)
}
