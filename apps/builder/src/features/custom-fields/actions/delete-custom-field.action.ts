"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { customFieldModel } from "@aha.chat/database/schema"
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
    .delete(customFieldModel)
    .where(
      and(
        eq(customFieldModel.chatbotId, chatbotId),
        inArray(customFieldModel.id, ids),
      ),
    )

  revalidateCacheTags(`chatbots:${chatbotId}#customFields`)
}
