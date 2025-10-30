import { type Prisma, prisma } from "@aha.chat/database"
import type { GoogleSheetsAuthValue } from "@aha.chat/integration-google-sheets"
import { unstable_cache } from "next/cache"
import { integrations } from "@/integration"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type {
  GetWorksheetHeaderSchema,
  GetWorksheetSchema,
  SpreadsheetResource,
} from "../schemas"

export const getSpreadSheets = async (
  input: GetWorksheetSchema,
): Promise<{
  data: SpreadsheetResource[]
  pageCount: number
}> => {
  let pageCount = 1
  const pagination: { skip?: number; take?: number } = {}
  if (input.perPage) {
    pagination.take = input.perPage
    pagination.skip = ((input.page ?? 1) - 1) * input.perPage
  }

  return await unstable_cache(
    async () => {
      const where: Prisma.SpreadsheetWhereInput = {
        chatbotId: input.chatbotId,
      }

      return await prisma.$transaction(async (tx) => {
        const data = await tx.spreadsheet.findMany({
          ...pagination,
          where,
        })

        if (pagination.skip && pagination.take) {
          const total = await tx.spreadsheet.count({ where })
          pageCount = Math.ceil(total / pagination.take)
        }

        return { data, pageCount }
      })
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
    id: input.spreadsheetId ?? "",
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

  const sheets = await integrations.GoogleSheets.actions.listSheetNames({
    ctx,
    props: {
      spreadsheetId: spreadsheet.spreadsheetId,
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
    id: input.spreadsheetId ?? "",
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

  const headers = await integrations.GoogleSheets.actions.listSheetHeaders({
    ctx,
    props: {
      spreadsheetId: spreadsheet.spreadsheetId,
      sheetName: input.sheetName ?? "",
    },
  })

  return { data: headers }
}
