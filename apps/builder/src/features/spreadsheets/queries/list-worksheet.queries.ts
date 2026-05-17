import { buildContext } from "@chatbotx.io/business"
import { findOrFail } from "@chatbotx.io/database/client"
import {
  integrationGoogleSheetsModel,
  spreadsheetModel,
} from "@chatbotx.io/database/schema"
import type { GoogleSheetsAuthValue } from "@chatbotx.io/integration-google-sheets"
import { integration } from "@chatbotx.io/integration-google-sheets"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListWorksheetHeadersRequest,
  ListWorksheetsRequest,
} from "../schema/query"

export const listWorksheets = async (
  input: ListWorksheetsRequest,
): Promise<{
  data: string[]
}> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const spreadsheet = await findOrFail({
    table: spreadsheetModel,
    where: {
      id: input.spreadsheetId,
      workspaceId: input.workspaceId,
    },
    message: "Spreadsheet not found",
  })

  const integrationGoogleSheets = await findOrFail({
    table: integrationGoogleSheetsModel,
    where: {
      workspaceId: input.workspaceId,
    },
    message: "Google Sheets integration not found",
  })

  const ctx = await buildContext({
    workspaceId: input.workspaceId,
    integrationType: "googleSheets",
    integration: {
      ...integrationGoogleSheets,
      auth: integrationGoogleSheets.auth as GoogleSheetsAuthValue,
    },
  })
  const sheets = await integration.runAction("listSheetNames", {
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
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const spreadsheet = await findOrFail({
    table: spreadsheetModel,
    where: {
      id: input.spreadsheetId,
      workspaceId: input.workspaceId,
    },
    message: "Spreadsheet not found",
  })

  const integrationGoogleSheets = await findOrFail({
    table: integrationGoogleSheetsModel,
    where: {
      workspaceId: input.workspaceId,
    },
    message: "Google Sheets integration not found",
  })

  const ctx = await buildContext({
    workspaceId: input.workspaceId,
    integrationType: "googleSheets",
    integration: {
      ...integrationGoogleSheets,
      auth: integrationGoogleSheets.auth as GoogleSheetsAuthValue,
    },
  })
  const headers = await integration.runAction("listSheetHeaders", {
    ctx,
    props: {
      spreadsheetId: spreadsheet.spreadsheetId,
      sheetName: input.sheetName ?? "",
    },
  })

  return { data: headers }
}
