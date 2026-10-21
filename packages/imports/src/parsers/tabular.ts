import { Readable } from "node:stream"
import { parse } from "csv-parse/sync"
import { readXlsxRows, XlsxLimitError } from "./xlsx"

export type TabularFormat = "csv" | "xlsx"
export type TabularFile = { headers: string[]; rows: string[][] }

export class TabularFileError extends Error {
  readonly reason: "empty" | "tooManyRows" | "invalid"

  constructor(reason: "empty" | "tooManyRows" | "invalid", message: string) {
    super(message)
    this.name = "TabularFileError"
    this.reason = reason
  }
}

const DELIMITERS = [",", ";", "\t"] as const
const BOM = String.fromCharCode(0xfe_ff)
const LINE_BREAK = /\r?\n/

/** Most frequent of `,` `;` tab in the header line; `,` on a tie or none. */
export function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  let best: "," | ";" | "\t" = ","
  let bestCount = 0
  for (const delimiter of DELIMITERS) {
    const count = headerLine.split(delimiter).length - 1
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

const isBlankRow = (row: string[]) => row.every((cell) => cell === "")

function toTable(raw: string[][], maxRows: number): TabularFile {
  const nonBlank = raw.filter((row) => !isBlankRow(row))
  const [headerRow, ...dataRows] = nonBlank
  if (!headerRow) {
    throw new TabularFileError("empty", "The file has no header row")
  }
  if (dataRows.length > maxRows) {
    throw new TabularFileError(
      "tooManyRows",
      `The file has more than ${maxRows} rows`,
    )
  }
  const width = headerRow.length
  return {
    headers: headerRow.map((header) => header.trim()),
    rows: dataRows.map((row) =>
      Array.from({ length: width }, (_, index) => row[index] ?? ""),
    ),
  }
}

function readCsv(buffer: Buffer, maxRows: number): TabularFile {
  let text = buffer.toString("utf8")
  if (text.startsWith(BOM)) {
    text = text.slice(1)
  }
  const headerLine = text.split(LINE_BREAK, 1)[0] ?? ""
  let raw: string[][]
  try {
    raw = parse(text, {
      delimiter: detectDelimiter(headerLine),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as string[][]
  } catch (error) {
    throw new TabularFileError(
      "invalid",
      error instanceof Error ? error.message : "Invalid CSV file",
    )
  }
  return toTable(raw, maxRows)
}

async function readXlsx(
  buffer: Buffer,
  maxRows: number,
  maxBytes: number,
): Promise<TabularFile> {
  let raw: string[][]
  try {
    raw = await readXlsxRows(Readable.from(buffer), {
      maxRows,
      maxCompressedBytes: maxBytes,
    })
  } catch (error) {
    if (error instanceof XlsxLimitError && error.kind === "rows") {
      throw new TabularFileError("tooManyRows", error.message)
    }
    throw new TabularFileError(
      "invalid",
      error instanceof Error ? error.message : "Invalid XLSX file",
    )
  }
  return toTable(raw, maxRows)
}

/**
 * Whole-file, in-memory read of a small tabular upload into header + string
 * rows. Blank rows are dropped and short rows are padded to the header width.
 * For row-streaming imports use `createImportRowParser` instead.
 */
export async function readTabularFile(input: {
  format: TabularFormat
  buffer: Buffer
  maxRows: number
  maxBytes: number
}): Promise<TabularFile> {
  if (input.buffer.length === 0) {
    throw new TabularFileError("empty", "The file is empty")
  }
  if (input.buffer.length > input.maxBytes) {
    throw new TabularFileError("invalid", "The file is too large")
  }
  return input.format === "csv"
    ? readCsv(input.buffer, input.maxRows)
    : await readXlsx(input.buffer, input.maxRows, input.maxBytes)
}
