"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
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

      revalidateTag(`chatbots:${spreadsheet.chatbotId}#spreadsheets`)
    },
  )
