import { findOrFail } from "@aha.chat/database/client"
import {
  integrationGoogleSheetsModel,
  spreadsheetModel,
} from "@aha.chat/database/schema"
import type {
  IntegrationGoogleSheetsModel,
  SpreadsheetModel,
} from "@aha.chat/database/types"
import type { GoogleSheetsAuthValue } from "@aha.chat/integration-google-sheets"
import { integrations } from "@/integration"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListWorksheetHeadersRequest,
  ListWorksheetsRequest,
} from "../schemas/list-worksheets.request"

export const listWorksheets = async (
  input: ListWorksheetsRequest,
): Promise<{
  data: string[]
}> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const spreadsheet = await findOrFail<SpreadsheetModel>(
    spreadsheetModel,
    {
      id: input.spreadsheetId,
      chatbotId: input.chatbotId,
    },
    "Spreadsheet not found",
  )

  const integrationGoogleSheets =
    await findOrFail<IntegrationGoogleSheetsModel>(
      integrationGoogleSheetsModel,
      {
        chatbotId: input.chatbotId,
      },
      "Google Sheets integration not found",
    )

  const ctx = {
    auth: integrationGoogleSheets.auth as GoogleSheetsAuthValue,
  }

  const sheets = await integrations.googleSheets.actions.listSheetNames({
    ctx,
    props: {
      spreadsheetId: spreadsheet.spreadsheetId,
    },
  })

  return { data: sheets }
}

export const listWorksheetHeaders = async (
  input: ListWorksheetHeadersRequest,
): Promise<{
  data: string[]
}> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const spreadsheet = await findOrFail<SpreadsheetModel>(
    spreadsheetModel,
    {
      id: input.spreadsheetId,
      chatbotId: input.chatbotId,
    },
    "Spreadsheet not found",
  )

  const integrationGoogleSheets =
    await findOrFail<IntegrationGoogleSheetsModel>(
      integrationGoogleSheetsModel,
      {
        chatbotId: input.chatbotId,
      },
      "Google Sheets integration not found",
    )

  const ctx = {
    auth: integrationGoogleSheets.auth as GoogleSheetsAuthValue,
  }

  const headers = await integrations.googleSheets.actions.listSheetHeaders({
    ctx,
    props: {
      spreadsheetId: spreadsheet.spreadsheetId,
      sheetName: input.sheetName ?? "",
    },
  })

  return { data: headers }
}
