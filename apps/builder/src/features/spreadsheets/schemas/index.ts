import type { SpreadsheetModel } from "@aha.chat/database/types"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export type SpreadsheetResource = SpreadsheetModel

export type SpreadsheetCollection = {
  data: SpreadsheetResource[]
  pageCount: number
}

export const getWorksheetSearchParams = createSearchParamsCache({
  page: parseAsInteger,
  perPage: parseAsInteger,
  spreadsheetId: parseAsString,
})
export type GetWorksheetSchema = Awaited<
  ReturnType<typeof getWorksheetSearchParams.parse>
> & { chatbotId: string }

export const getWorksheetHeaderSearchParams = createSearchParamsCache({
  spreadsheetId: parseAsString,
  sheetName: parseAsString,
})
export type GetWorksheetHeaderSchema = Awaited<
  ReturnType<typeof getWorksheetHeaderSearchParams.parse>
> & { chatbotId: string }
