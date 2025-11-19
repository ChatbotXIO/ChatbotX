import { prisma } from "@aha.chat/database"
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

  const spreadsheet = await prisma.spreadsheet.findFirstOrThrow({
    where: {
      chatbotId: input.chatbotId,
      id: input.spreadsheetId,
    },
  })
  const integrationGoogleSheets =
    await prisma.integrationGoogleSheets.findFirstOrThrow({
      where: {
        chatbotId: input.chatbotId,
      },
    })
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

  const spreadsheet = await prisma.spreadsheet.findFirstOrThrow({
    where: {
      chatbotId: input.chatbotId,
      id: input.spreadsheetId,
    },
  })
  const integrationGoogleSheets =
    await prisma.integrationGoogleSheets.findFirstOrThrow({
      where: {
        chatbotId: input.chatbotId,
      },
    })
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
