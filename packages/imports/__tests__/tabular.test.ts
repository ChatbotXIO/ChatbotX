import ExcelJS from "exceljs"
import { describe, expect, test } from "vitest"
import {
  detectDelimiter,
  readTabularFile,
  TabularFileError,
} from "../src/parsers/tabular"

const MB = 1024 * 1024
const csv = (text: string) => Buffer.from(text, "utf8")

async function xlsxBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Sheet1")
  for (const row of rows) {
    sheet.addRow(row)
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe("detectDelimiter", () => {
  test("picks the most frequent of , ; and tab in the header line", () => {
    expect(detectDelimiter("email,phone,fn")).toBe(",")
    expect(detectDelimiter("email;phone;fn")).toBe(";")
    expect(detectDelimiter("email\tphone\tfn")).toBe("\t")
    expect(detectDelimiter("email")).toBe(",")
  })
})

describe("readTabularFile — csv", () => {
  test("returns headers and rows as string arrays", async () => {
    const result = await readTabularFile({
      format: "csv",
      buffer: csv("email,phone\na@b.co,123\n\nc@d.co,\n"),
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result).toEqual({
      headers: ["email", "phone"],
      rows: [
        ["a@b.co", "123"],
        ["c@d.co", ""],
      ],
    })
  })

  test("strips a UTF-8 BOM and detects ; (Excel European export)", async () => {
    const result = await readTabularFile({
      format: "csv",
      buffer: csv(
        `${String.fromCharCode(0xfe_ff)}email;phone\na@b.co;+33 1 23\n`,
      ),
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result.headers).toEqual(["email", "phone"])
    expect(result.rows).toEqual([["a@b.co", "+33 1 23"]])
  })

  test("keeps quoted delimiters inside a cell", async () => {
    const result = await readTabularFile({
      format: "csv",
      buffer: csv('fn,ct\n"Doe, John","New York"\n'),
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result.rows).toEqual([["Doe, John", "New York"]])
  })

  test("pads short rows to the header width", async () => {
    const result = await readTabularFile({
      format: "csv",
      buffer: csv("email,phone,fn\na@b.co\n"),
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result.rows).toEqual([["a@b.co", "", ""]])
  })

  test("rejects more than maxRows data rows", async () => {
    await expect(
      readTabularFile({
        format: "csv",
        buffer: csv("email\na\nb\nc\n"),
        maxRows: 2,
        maxBytes: MB,
      }),
    ).rejects.toMatchObject({ reason: "tooManyRows" })
  })

  test("rejects an empty file", async () => {
    await expect(
      readTabularFile({
        format: "csv",
        buffer: csv(""),
        maxRows: 2,
        maxBytes: MB,
      }),
    ).rejects.toBeInstanceOf(TabularFileError)
  })
})

describe("readTabularFile — size cap", () => {
  test("rejects a buffer larger than maxBytes", async () => {
    await expect(
      readTabularFile({
        format: "csv",
        buffer: csv("email\na@b.co\n"),
        maxRows: 10,
        maxBytes: 5,
      }),
    ).rejects.toMatchObject({ reason: "invalid" })
  })
})

describe("readTabularFile — xlsx", () => {
  test("reads the first worksheet, formatting dates as YYYY-MM-DD", async () => {
    const buffer = await xlsxBuffer([
      ["email", "phone", "dob"],
      ["a@b.co", 16_505_615_622, new Date(Date.UTC(1968, 9, 21))],
    ])
    const result = await readTabularFile({
      format: "xlsx",
      buffer,
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result).toEqual({
      headers: ["email", "phone", "dob"],
      rows: [["a@b.co", "16505615622", "1968-10-21"]],
    })
  })

  test("honours a maxRows above the shared 10,000 default", async () => {
    const rows: unknown[][] = [["email"]]
    for (let i = 0; i < 10_050; i++) {
      rows.push([`u${i}@x.co`])
    }
    const result = await readTabularFile({
      format: "xlsx",
      buffer: await xlsxBuffer(rows),
      maxRows: 20_000,
      maxBytes: 20 * MB,
    })
    expect(result.rows).toHaveLength(10_050)
  })

  test("keeps a blank middle header cell as an empty string", async () => {
    const result = await readTabularFile({
      format: "xlsx",
      buffer: await xlsxBuffer([
        ["email", null, "fn"],
        ["a@b.co", "x", "Ann"],
      ]),
      maxRows: 10,
      maxBytes: MB,
    })
    expect(result.headers).toEqual(["email", "", "fn"])
    expect(result.rows).toEqual([["a@b.co", "x", "Ann"]])
  })

  test("maps the row cap to tooManyRows", async () => {
    await expect(
      readTabularFile({
        format: "xlsx",
        buffer: await xlsxBuffer([["email"], ["a"], ["b"], ["c"]]),
        maxRows: 2,
        maxBytes: MB,
      }),
    ).rejects.toMatchObject({ reason: "tooManyRows" })
  })
})
