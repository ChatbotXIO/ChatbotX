import { db } from "@aha.chat/database/client"
import type { GoogleSheetsAuthValue } from "@aha.chat/integration-google-sheets"
import { returnValidationErrors } from "next-safe-action"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { createSpreadsheetRequest } from "../schemas/create-spreadsheet.request"

const SPREADSHEET_ID_REGEX = /\/d\/([^/]+)\//

export async function verifyGoogleSheetsUrl(
  chatbotId: string,
  url: string,
): Promise<string> {
  const dbIntegration = await db.query.integrationModel.findFirst({
    where: {
      chatbotId,
      integrationType: "googleSheets",
    },
    with: {
      integrationGoogleSheets: true,
    },
  })
  if (!dbIntegration?.integrationGoogleSheets) {
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
    await integrations.googleSheets.actions.listSheetNames({
      ctx: {
        auth: dbIntegration.integrationGoogleSheets
          .auth as unknown as GoogleSheetsAuthValue,
      },
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
