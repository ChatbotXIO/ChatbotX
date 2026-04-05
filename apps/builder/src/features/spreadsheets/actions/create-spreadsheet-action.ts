"use server"

import { db } from "@chatbotx.io/database/client"
import { spreadsheetModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateSpreadsheetRequest,
  createSpreadsheetRequest,
} from "../schema/mutation"
import { verifyGoogleSheetsUrl } from "./util"

export const createSpreadsheetAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createSpreadsheetRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateSpreadsheetRequest
    }) => {
      const spreadsheetId = await verifyGoogleSheetsUrl(
        workspaceId,
        parsedInput.url,
      )

      await db.insert(spreadsheetModel).values({
        ...parsedInput,
        id: createId(),
        workspaceId,
        spreadsheetId,
      })

      revalidateCacheTags(`workspaces:${workspaceId}#spreadsheets`)
    },
  )
