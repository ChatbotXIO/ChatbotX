import type { Readable } from "node:stream"
import { parse } from "csv-parse"

export type ImportCsvRow = Record<string, string>

export const IMPORT_CSV_PARSE_OPTIONS = {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  bom: true,
} as const

export const createImportCsvParser = (stream: Readable) =>
  stream.pipe(parse(IMPORT_CSV_PARSE_OPTIONS))
