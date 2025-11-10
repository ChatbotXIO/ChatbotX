"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateSpreadsheetRequest,
  createSpreadsheetRequest,
} from "../schemas/create-spreadsheet.request"
import { verifyGoogleSheetsUrl } from "./util"

export const updateSpreadsheetAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(createSpreadsheetRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: CreateSpreadsheetRequest
    }) => {
      const spreadsheet = await prisma.spreadsheet.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      const spreadsheetId = await verifyGoogleSheetsUrl(
        chatbotId,
        parsedInput.url,
      )

      await prisma.spreadsheet.update({
        where: {
          id: spreadsheet.id,
        },
        data: {
          ...parsedInput,
          spreadsheetId,
        },
      })

      revalidateCacheTags(`chatbots:${spreadsheet.chatbotId}#spreadsheets`)
    },
  )
