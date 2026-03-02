"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { spreadsheetModel } from "@aha.chat/database/schema"
import type { SpreadsheetModel } from "@aha.chat/database/types"
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
      const spreadsheet = await findOrFail<SpreadsheetModel>(
        spreadsheetModel,
        {
          id,
          chatbotId,
        },
        "Spreadsheet not found",
      )

      const spreadsheetId = await verifyGoogleSheetsUrl(
        chatbotId,
        parsedInput.url,
      )

      await db
        .update(spreadsheetModel)
        .set({
          ...parsedInput,
          spreadsheetId,
        })
        .where(eq(spreadsheetModel.id, spreadsheet.id))

      revalidateCacheTags(`chatbots:${spreadsheet.chatbotId}#spreadsheets`)
    },
  )
