"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateSpreadsheetRequest,
  createSpreadsheetRequest,
} from "../schemas/create-spreadsheet.request"
import { verifyGoogleSheetsUrl } from "./util"

export const createSpreadsheetAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createSpreadsheetRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateSpreadsheetRequest
    }) => {
      const spreadsheetId = await verifyGoogleSheetsUrl(
        chatbotId,
        parsedInput.url,
      )

      await prisma.spreadsheet.create({
        data: {
          ...parsedInput,
          chatbotId,
          spreadsheetId,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#spreadsheets`)
    },
  )
