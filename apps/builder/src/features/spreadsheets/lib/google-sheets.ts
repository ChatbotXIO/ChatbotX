import {
  buildContext,
  integrationGoogleSheetService,
  spreadsheetService,
} from "@chatbotx.io/business"
import { validationException } from "@chatbotx.io/business/errors"
import type { GoogleSheetsAuthValue } from "@chatbotx.io/integration-google-sheets"
import { integration as googleSheetsIntegration } from "@chatbotx.io/integration-google-sheets"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"

const SPREADSHEET_ID_REGEX = /\/d\/([^/]+)\//

export async function resolveSpreadsheetIdFromUrl(input: {
  workspaceId: string
  url: string
  messages: { integrationMissing: string; invalidUrl: string }
}): Promise<string> {
  const { workspaceId, url, messages } = input

  const sheetIntegration =
    await integrationGoogleSheetService.findByWorkspaceId(workspaceId)
  if (!sheetIntegration) {
    throw validationException("url", messages.integrationMissing)
  }

  const matches = new URL(url).pathname.match(SPREADSHEET_ID_REGEX)
  if (!matches?.[1]) {
    throw validationException("url", messages.invalidUrl)
  }
  const spreadsheetId = matches[1]

  try {
    const ctx = await buildContext({
      workspaceId,
      integrationType: "googleSheets",
      integration: {
        ...sheetIntegration,
        auth: sheetIntegration.auth as GoogleSheetsAuthValue,
      },
    })
    await integrations.googleSheets.runAction("listSheetNames", {
      ctx,
      props: { spreadsheetId },
    })
  } catch (error) {
    logger.error(error, "Unable to get data from google sheets")
    throw validationException("url", messages.invalidUrl)
  }

  return spreadsheetId
}

export async function listWorksheets(input: {
  workspaceId: string
  spreadsheetId: string
}): Promise<{ data: string[] }> {
  const spreadsheet = await spreadsheetService.findByWorkspaceIdOrFail({
    id: input.spreadsheetId,
    workspaceId: input.workspaceId,
  })

  const integrationGoogleSheets =
    await integrationGoogleSheetService.findByWorkspaceIdOrFail(
      input.workspaceId,
    )

  const ctx = await buildContext({
    workspaceId: input.workspaceId,
    integrationType: "googleSheets",
    integration: {
      ...integrationGoogleSheets,
      auth: integrationGoogleSheets.auth as GoogleSheetsAuthValue,
    },
  })
  const sheets = await googleSheetsIntegration.runAction("listSheetNames", {
    ctx,
    props: {
      spreadsheetId: spreadsheet.spreadsheetId,
    },
  })

  return { data: sheets }
}

export async function listWorksheetHeaders(input: {
  workspaceId: string
  spreadsheetId: string
  sheetName: string
}): Promise<{ data: string[] }> {
  const spreadsheet = await spreadsheetService.findByWorkspaceIdOrFail({
    id: input.spreadsheetId,
    workspaceId: input.workspaceId,
  })

  const integrationGoogleSheets =
    await integrationGoogleSheetService.findByWorkspaceIdOrFail(
      input.workspaceId,
    )

  const ctx = await buildContext({
    workspaceId: input.workspaceId,
    integrationType: "googleSheets",
    integration: {
      ...integrationGoogleSheets,
      auth: integrationGoogleSheets.auth as GoogleSheetsAuthValue,
    },
  })
  const headers = await googleSheetsIntegration.runAction("listSheetHeaders", {
    ctx,
    props: {
      spreadsheetId: spreadsheet.spreadsheetId,
      sheetName: input.sheetName ?? "",
    },
  })

  return { data: headers }
}
