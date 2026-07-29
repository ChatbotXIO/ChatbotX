import type { Readable } from "node:stream"
import ExcelJS, { type CellValue } from "exceljs"
import { Open } from "unzipper"

type ImportRowIterable = AsyncIterable<Record<string, unknown>>
const MAX_BUFFERED_XLSX_ROWS = 10_001
const MAX_COMPRESSED_XLSX_BYTES = 10 * 1024 * 1024
const MAX_UNCOMPRESSED_XLSX_BYTES = 100 * 1024 * 1024
const MAX_XLSX_ARCHIVE_ENTRIES = 10_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const readRichText = (value: Record<string, unknown>): string | undefined => {
  const richText = value.richText
  if (!Array.isArray(richText)) {
    return
  }
  return richText
    .map((item) =>
      isRecord(item) && typeof item.text === "string" ? item.text : "",
    )
    .join("")
}

export const toImportCellValue = (
  value: CellValue,
): string | number | boolean | Date | undefined => {
  if (value === null || value === undefined || value === "") {
    return
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value
  }
  if (!isRecord(value)) {
    return
  }

  if ("result" in value) {
    const result = value.result
    return result instanceof Date ||
      typeof result === "string" ||
      typeof result === "number" ||
      typeof result === "boolean"
      ? result
      : undefined
  }
  if (typeof value.text === "string") {
    return value.text
  }
  return readRichText(value)
}

const cellToHeader = (value: CellValue): string => {
  const normalized = toImportCellValue(value)
  if (normalized instanceof Date) {
    return normalized.toISOString()
  }
  return normalized === undefined ? "" : String(normalized).trim()
}

const readBoundedXlsxBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (totalBytes > MAX_COMPRESSED_XLSX_BYTES) {
      throw new Error("XLSX file exceeds the 10MB compressed size limit")
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks, totalBytes)
}

export const assertXlsxArchiveWithinLimits = async (
  buffer: Buffer,
  limits: {
    maxEntries?: number
    maxUncompressedBytes?: number
  } = {},
): Promise<void> => {
  const directory = await Open.buffer(buffer)
  const maxEntries = limits.maxEntries ?? MAX_XLSX_ARCHIVE_ENTRIES
  const maxUncompressedBytes =
    limits.maxUncompressedBytes ?? MAX_UNCOMPRESSED_XLSX_BYTES
  if (directory.files.length > maxEntries) {
    throw new Error(`XLSX archive entry limit exceeded (${maxEntries})`)
  }
  const uncompressedBytes = directory.files.reduce(
    (total, file) => total + file.uncompressedSize,
    0,
  )
  if (uncompressedBytes > maxUncompressedBytes) {
    throw new Error(
      `XLSX uncompressed size limit exceeded (${maxUncompressedBytes} bytes)`,
    )
  }
}

const collectFirstWorksheet = async (
  stream: Readable,
): Promise<CellValue[][]> => {
  const buffer = await readBoundedXlsxBuffer(stream)
  await assertXlsxArchiveWithinLimits(buffer)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error("The workbook has no worksheets")
  }
  const rows: CellValue[][] = []

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length >= MAX_BUFFERED_XLSX_ROWS) {
      throw new Error(`XLSX row limit exceeded (${MAX_BUFFERED_XLSX_ROWS - 1})`)
    }
    rows.push(Array.isArray(row.values) ? row.values.slice(1) : [])
  })

  return rows
}

async function* parseXlsxRows(stream: Readable): ImportRowIterable {
  try {
    const rows = await collectFirstWorksheet(stream)
    let headers: string[] | undefined
    for (const values of rows) {
      if (!headers) {
        const candidateHeaders = values.map(cellToHeader)
        if (candidateHeaders.every((header) => !header)) {
          continue
        }
        headers = candidateHeaders
        continue
      }

      const importedRow: Record<string, unknown> = {}
      let hasValue = false
      for (const [index, header] of headers.entries()) {
        if (!header) {
          continue
        }
        const value = toImportCellValue(values[index])
        importedRow[header] = value
        hasValue ||= value !== undefined
      }
      if (hasValue) {
        yield importedRow
      }
    }
    if (!headers) {
      throw new Error("The first worksheet has no header row")
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown workbook error"
    throw new Error(`Invalid XLSX file: ${message}`, { cause: error })
  }
}

export const createImportXlsxParser = (stream: Readable): ImportRowIterable =>
  parseXlsxRows(stream)

export const readXlsxHeaders = async (stream: Readable): Promise<string[]> => {
  try {
    const rows = await collectFirstWorksheet(stream)
    for (const values of rows) {
      const headers = values.map(cellToHeader)
      if (headers.some(Boolean)) {
        return headers
      }
    }
    throw new Error("The first worksheet has no header row")
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown workbook error"
    throw new Error(`Invalid XLSX file: ${message}`, { cause: error })
  }
}
