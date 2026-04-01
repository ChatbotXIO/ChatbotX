import { findOrFail } from "@chatbotx.io/database/client"
import {
  integrationGoogleSheetsModel,
  spreadsheetModel,
} from "@chatbotx.io/database/schema"
import type { GoogleSheetsAuthValue } from "@chatbotx.io/integration-google-sheets"
import { integrations } from "@/integration"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListWorksheetHeadersRequest,
  ListWorksheetsRequest,
} from "../schemas/query"

export const listWorksheets = async (
  input: ListWorksheetsRequest,
): Promise<{
  data: string[]
}> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const spreadsheet = await findOrFail(
    spreadsheetModel,
    {
      id: input.spreadsheetId,
      chatbotId: input.chatbotId,
    },
    "Spreadsheet not found",
  )

  const integrationGoogleSheets = await findOrFail(
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

  const spreadsheet = await findOrFail(
    spreadsheetModel,
    {
      id: input.spreadsheetId,
      chatbotId: input.chatbotId,
    },
    "Spreadsheet not found",
  )

  const integrationGoogleSheets = await findOrFail(
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
