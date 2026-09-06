"use server"

import { spreadsheetService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
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
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateSpreadsheetRequest
    }) => {
      const spreadsheetId = await verifyGoogleSheetsUrl(
        workspaceId,
        parsedInput.url,
      )

      await spreadsheetService.create({
        workspaceId,
        spreadsheetId,
        data: parsedInput,
      })
    },
  )
