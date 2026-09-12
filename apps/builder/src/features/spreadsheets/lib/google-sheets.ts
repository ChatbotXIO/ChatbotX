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
const SPREADSHEET_HOST = "docs.google.com"
const SPREADSHEET_PATH_PREFIX = "/spreadsheets/"

/**
 * Extracts the spreadsheet id from a Google Sheets URL, validating the parsed
 * URL rather than a substring of the raw string. A substring test accepts
 * `javascript:fetch(1)//docs.google.com/spreadsheets/d/ID/` and
 * `https://evil.com/docs.google.com/spreadsheets/d/ID/`, both of which would
 * persist to `Spreadsheet.url` and later render as a bare href.
 */
function parseSpreadsheetId(url: string): string | null {
  if (!URL.canParse(url)) {
    return null
  }

  const parsed = new URL(url)
  if (
    parsed.protocol !== "https:" ||
    parsed.host !== SPREADSHEET_HOST ||
    !parsed.pathname.startsWith(SPREADSHEET_PATH_PREFIX)
  ) {
    return null
  }

  return parsed.pathname.match(SPREADSHEET_ID_REGEX)?.[1] ?? null
}

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

  const spreadsheetId = parseSpreadsheetId(url)
  if (!spreadsheetId) {
    throw validationException("url", messages.invalidUrl)
  }

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
