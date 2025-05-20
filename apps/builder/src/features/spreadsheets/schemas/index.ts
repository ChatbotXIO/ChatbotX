import type { SpreadsheetModel } from "@aha.chat/database/types"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export type SpreadsheetResource = SpreadsheetModel

export const getSpreadSheetSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
})

export const getWorksheetSearchParams = createSearchParamsCache({
  spreadsheetId: parseAsString.withDefault(""),
})

export const getWorksheetHeaderSearchParams = createSearchParamsCache({
  spreadsheetId: parseAsString.withDefault(""),
  sheetName: parseAsString.withDefault(""),
})

export type GetSpreadSheetSchema = Awaited<
  ReturnType<typeof getSpreadSheetSearchParams.parse>
> & { chatbotId: string }

export type GetWorksheetSchema = Awaited<
  ReturnType<typeof getWorksheetSearchParams.parse>
> & { chatbotId: string }

export type GetWorksheetHeaderSchema = Awaited<
  ReturnType<typeof getWorksheetHeaderSearchParams.parse>
> & { chatbotId: string }
