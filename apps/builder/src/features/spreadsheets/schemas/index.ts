import type { SpreadsheetModel } from "@aha.chat/database/types"
import { createSearchParamsCache, parseAsString } from "nuqs/server"

export type SpreadsheetResource = SpreadsheetModel

export type SpreadsheetCollection = {
  data: SpreadsheetResource[]
  pageCount: number
}

export const getWorksheetSearchParams = createSearchParamsCache({
  spreadsheetId: parseAsString.withDefault(""),
})

export const getWorksheetHeaderSearchParams = createSearchParamsCache({
  spreadsheetId: parseAsString.withDefault(""),
  sheetName: parseAsString.withDefault(""),
})

export type GetWorksheetSchema = Awaited<
  ReturnType<typeof getWorksheetSearchParams.parse>
> & { chatbotId: string }

export type GetWorksheetHeaderSchema = Awaited<
  ReturnType<typeof getWorksheetHeaderSearchParams.parse>
> & { chatbotId: string }
