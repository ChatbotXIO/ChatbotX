import {
  buildContext,
  integrationGoogleSheetService,
} from "@chatbotx.io/business"
import type { GoogleSheetsAuthValue } from "@chatbotx.io/integration-google-sheets"
import { returnValidationErrors } from "next-safe-action"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { createSpreadsheetRequest } from "../schema/mutation"

const SPREADSHEET_ID_REGEX = /\/d\/([^/]+)\//

export async function verifyGoogleSheetsUrl(
  workspaceId: string,
  url: string,
): Promise<string> {
  const sheetIntegration =
    await integrationGoogleSheetService.findByWorkspaceId(workspaceId)
  if (!sheetIntegration) {
    returnValidationErrors(createSpreadsheetRequest, {
      url: {
        _errors: ["You need to setup google sheets first."],
      },
    })
  }

  // guess spreadsheetId
  const matches = new URL(url).pathname.match(SPREADSHEET_ID_REGEX)
  if (!matches?.[1]) {
    returnValidationErrors(createSpreadsheetRequest, {
      url: {
        _errors: ["URL is not valid."],
      },
    })
  }

  // make sure integration can access to url
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
      props: {
        spreadsheetId: matches[1],
      },
    })
  } catch (e) {
    logger.error(e, "Unable to get data from google sheets")

    returnValidationErrors(createSpreadsheetRequest, {
      url: {
        _errors: ["URL must be public or shareable"],
      },
    })
  }

  return matches[1]
}
