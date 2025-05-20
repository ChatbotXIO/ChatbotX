import { type Prisma, prisma } from "@aha.chat/database"
import type { GoogleSheetsAuthValue } from "@aha.chat/integration-google-sheets"
import { unstable_cache } from "next/cache"
import { integrations } from "@/integration"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type {
  GetSpreadSheetSchema,
  GetWorksheetHeaderSchema,
  GetWorksheetSchema,
  SpreadsheetResource,
} from "../schemas"
import { parseSpreadsheetId } from "../utils"

export const getSpreadSheets = async (
  input: GetSpreadSheetSchema,
): Promise<{
  data: SpreadsheetResource[]
  pageCount: number
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.SpreadsheetWhereInput = {
        chatbotId: input.chatbotId,
      }
      const [data, total] = await prisma.$transaction([
        prisma.spreadsheet.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
        }),
        prisma.spreadsheet.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#spreadsheets`],
    },
  )()
}

export const getWorkSheets = async (
  input: GetWorksheetSchema,
): Promise<{
  data: string[]
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  const where: Prisma.SpreadsheetWhereInput = {
    chatbotId: input.chatbotId,
    id: input.spreadsheetId,
  }
  const spreadsheet = await prisma.spreadsheet.findFirstOrThrow({
    where,
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
  const spreadsheetId = parseSpreadsheetId(spreadsheet.url)
  if (!spreadsheetId) {
    throw new Error("Invalid spreadsheet url")
  }

  const sheets =
    await integrations.GOOGLE_SHEETS.integration.actions.listSheetNames({
      ctx,
      props: {
        spreadsheetId,
      },
    })

  return { data: sheets }
}

export const getWorkSheetHeaders = async (
  input: GetWorksheetHeaderSchema,
): Promise<{
  data: string[]
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  const where: Prisma.SpreadsheetWhereInput = {
    chatbotId: input.chatbotId,
    id: input.spreadsheetId,
  }
  const spreadsheet = await prisma.spreadsheet.findFirstOrThrow({
    where,
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
  const spreadsheetId = parseSpreadsheetId(spreadsheet.url)
  if (!spreadsheetId) {
    throw new Error("Invalid spreadsheet url")
  }

  const headers =
    await integrations.GOOGLE_SHEETS.integration.actions.listSheetHeaders({
      ctx,
      props: {
        spreadsheetId,
        sheetName: input.sheetName,
      },
    })

  return { data: headers }
}
