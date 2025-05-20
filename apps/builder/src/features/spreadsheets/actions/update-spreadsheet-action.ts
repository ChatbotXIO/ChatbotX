"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type SaveSpreadsheetSchema,
  saveSpreadsheetSchema,
} from "../schemas/save-spreadsheet-schema"

export const updateSpreadsheetAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .inputSchema(saveSpreadsheetSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: SaveSpreadsheetSchema
    }) => {
      const spreadsheet = await prisma.spreadsheet.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.spreadsheet.update({
        where: {
          id: spreadsheet.id,
        },
        data: parsedInput,
      })

      revalidateTag(`chatbots:${spreadsheet.chatbotId}#spreadsheets`)
    },
  )
