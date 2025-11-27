"use server"

import { prisma } from "@aha.chat/database"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteSpreadsheetAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .schema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await prisma.spreadsheet.deleteMany({
        where: {
          id: {
            in: parsedInput.ids,
          },
          chatbotId,
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#spreadsheets`)
    },
  )
