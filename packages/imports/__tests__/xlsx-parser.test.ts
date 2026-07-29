import { Readable } from "node:stream"
import ExcelJS from "exceljs"
import { describe, expect, test } from "vitest"
import {
  assertXlsxArchiveWithinLimits,
  createImportRowParser,
  createImportXlsxParser,
} from "../src/parsers"

const LEGACY_XLS_ERROR_REGEX = /Save the workbook as \.xlsx/
const INVALID_XLSX_ERROR_REGEX = /Invalid XLSX file/

const createWorkbook = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet("Products")
  worksheet.addRow(["Name", "Price", "Available", "Launch date", "Formula"])
  worksheet.addRow([
    "One",
    9.99,
    true,
    new Date("2026-07-01T00:00:00.000Z"),
    { formula: "B2*2", result: 19.98 },
  ])
  worksheet.addRow(["Two"])
  worksheet.addRow(["Three", 14])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

const collectRows = async (
  iterable: AsyncIterable<Record<string, unknown>>,
): Promise<Record<string, unknown>[]> => {
  const rows: Record<string, unknown>[] = []
  for await (const row of iterable) {
    rows.push(row)
  }
  return rows
}

describe("XLSX import parser", () => {
  test("reads data rows and normalizes ExcelJS cell objects", async () => {
    const rows = await collectRows(
      createImportXlsxParser(Readable.from([await createWorkbook()])),
    )

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      Name: "One",
      Price: 9.99,
      Available: true,
      Formula: 19.98,
    })
    expect(rows[0]?.["Launch date"]).toBeInstanceOf(Date)
    expect(rows[1]).toMatchObject({
      Name: "Two",
      Price: undefined,
    })
  })

  test("rejects legacy XLS with an actionable message", () => {
    expect(() => createImportRowParser("xls", Readable.from([]))).toThrow(
      LEGACY_XLS_ERROR_REGEX,
    )
  })

  test("rejects a corrupt workbook with a stable parser error", async () => {
    await expect(
      collectRows(
        createImportXlsxParser(Readable.from([Buffer.from("not a zip")])),
      ),
    ).rejects.toThrow(INVALID_XLSX_ERROR_REGEX)
  })

  test("rejects an XLSX archive whose expanded contents exceed the safety limit", async () => {
    const buffer = await createWorkbook()

    await expect(
      assertXlsxArchiveWithinLimits(buffer, {
        maxUncompressedBytes: 1,
      }),
    ).rejects.toThrow("XLSX uncompressed size limit exceeded")
  })
})
