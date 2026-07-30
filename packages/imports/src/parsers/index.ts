import type { Readable } from "node:stream"
import type { ImportFormat } from "@chatbotx.io/database/partials"
import { createImportCsvParser } from "./csv"
import { createImportXlsxParser } from "./xlsx"

export type ImportRowIterable = AsyncIterable<Record<string, unknown>>

export const createImportRowParser = (
  format: ImportFormat,
  stream: Readable,
): ImportRowIterable => {
  switch (format) {
    case "csv":
      return createImportCsvParser(stream) as ImportRowIterable
    case "xlsx":
      return createImportXlsxParser(stream)
    case "xls":
      throw new Error(
        "Legacy .xls files are not supported. Save the workbook as .xlsx and try again.",
      )
    default: {
      const exhaustive: never = format
      throw new Error(`Unknown import format: ${exhaustive as string}`)
    }
  }
}

export * from "./cell"
export {
  createImportCsvParser,
  IMPORT_CSV_PARSE_OPTIONS,
  type ImportCsvRow,
} from "./csv"
export { extractCsvHeaders, parseCsvLine } from "./headers"
export {
  assertXlsxArchiveWithinLimits,
  createImportXlsxParser,
  readXlsxHeaders,
  toImportCellValue,
} from "./xlsx"
