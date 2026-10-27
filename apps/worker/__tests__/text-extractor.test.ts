import { Readable } from "node:stream"
import { afterEach, describe, expect, test, vi } from "vitest"
import { type Sheet2JSONOpts, utils, write } from "xlsx"

const pdfParse = vi.hoisted(() => vi.fn())
const getObjectStream = vi.hoisted(() => vi.fn())

vi.mock("pdf-parse-new", () => ({ default: pdfParse }))
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { getObjectStream },
}))

import {
  FileFetchError,
  FileSizeLimitError,
} from "../src/ai-agent/lib/extraction-errors"
import {
  extractKnowledgeDocument,
  extractTextFromFile,
  extractTextFromPdf,
} from "../src/ai-agent/lib/text-extractor"

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

// The stream is consumed on read, so every extraction needs a fresh one.
function mockStoredFile(buffer: Buffer): void {
  getObjectStream.mockImplementation(async () => ({
    stream: Readable.from([buffer]),
  }))
}

function xlsxBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const workbook = utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), name)
  }
  return Buffer.from(write(workbook, { type: "buffer", bookType: "xlsx" }))
}

function tabularTextLength(document: {
  sheets: { headers: string[]; rows: string[][] }[]
}): number {
  return document.sheets
    .flatMap((sheet) => [...sheet.headers, ...sheet.rows.flat()])
    .join("").length
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("extractTextFromPdf", () => {
  test("removes NUL and other control characters before persistence", async () => {
    pdfParse.mockResolvedValue({
      text: "Alpha\0Beta\u0001Gamma\tDelta\r\nEpsilon",
    })

    await expect(extractTextFromPdf(Buffer.from("pdf"))).resolves.toBe(
      "Alpha Beta Gamma Delta\nEpsilon",
    )
  })
})

// Expected strings were captured from extractTextFromFile before the Phase 1
// refactor: the document-reading tool and conversation sources depend on them.
describe("extractTextFromFile (unchanged legacy output)", () => {
  test.each([
    [
      "knowledge/prices.csv",
      "text/csv",
      Buffer.from("Product,Price\nCà phê,10000"),
      "Product,Price\nCà phê,10000",
    ],
    [
      "knowledge/policy.md",
      "text/markdown",
      Buffer.from("# Policy\n\n- Keep the **receipt**\n\n[Link](https://x.io)"),
      "Policy\n\nKeep the receipt\n\nLink",
    ],
    [
      "knowledge/prices.xlsx",
      XLSX_MIME,
      xlsxBuffer({
        Prices: [
          ["Product", "Price", "Note"],
          ["Basic", 199_000, ""],
          ["Pro", 499_000, "best"],
        ],
      }),
      "Product: Basic\nPrice: 199000\n\nProduct: Pro\nPrice: 499000\nNote: best",
    ],
    [
      "knowledge/notes.txt",
      "text/plain",
      Buffer.from("Line one\r\nLine\ttwo\u0000end"),
      "Line one\nLine two end",
    ],
  ])("%s", async (path, mimeType, buffer, expected) => {
    mockStoredFile(buffer)

    await expect(extractTextFromFile(path, mimeType)).resolves.toBe(expected)
  })
})

describe("extractKnowledgeDocument", () => {
  test("reads a Vietnamese CSV without BOM as a table named after the file", async () => {
    mockStoredFile(Buffer.from("Product,Price\nCà phê,10000"))

    await expect(
      extractKnowledgeDocument("knowledge/prices.csv", "text/csv", {
        sourceName: "prices.csv",
      }),
    ).resolves.toEqual({
      kind: "tabular",
      sheets: [
        {
          name: "prices.csv",
          headers: ["Product", "Price"],
          rows: [["Cà phê", "10000"]],
        },
      ],
      truncated: false,
    })
  })

  test("keeps CSV cells as written instead of reformatting dates and numbers", async () => {
    mockStoredFile(
      Buffer.from(
        "Phone,Date,US date,Rate,Big\n0901234567,2024-01-15,1/2/2024,10%,12345678901234567890",
      ),
    )

    const document = await extractKnowledgeDocument(
      "knowledge/contacts.csv",
      "text/csv",
      { sourceName: "contacts.csv" },
    )

    expect(document).toMatchObject({
      kind: "tabular",
      sheets: [
        {
          rows: [
            [
              "0901234567",
              "2024-01-15",
              "1/2/2024",
              "10%",
              "12345678901234567890",
            ],
          ],
        },
      ],
    })
  })

  test("names unnamed columns and skips sheets without data rows", async () => {
    mockStoredFile(
      xlsxBuffer({
        Empty: [["Only", "Header"]],
        Prices: [
          ["Product", "", "Price"],
          ["Basic", "x", 199_000],
        ],
      }),
    )

    await expect(
      extractKnowledgeDocument("knowledge/prices.xlsx", XLSX_MIME, {
        sourceName: "prices.xlsx",
      }),
    ).resolves.toEqual({
      kind: "tabular",
      sheets: [
        {
          name: "Prices",
          headers: ["Product", "Column 2", "Price"],
          rows: [["Basic", "x", "199000"]],
        },
      ],
      truncated: false,
    })
  })

  test("reads XLSX dates as displayed instead of Excel serial numbers", async () => {
    const sheet = utils.aoa_to_sheet([["Date"], [new Date(2024, 0, 15)]], {
      cellDates: true,
      dateNF: "dd/mm/yyyy",
    })
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, sheet, "Orders")
    mockStoredFile(
      Buffer.from(write(workbook, { type: "buffer", bookType: "xlsx" })),
    )

    const document = await extractKnowledgeDocument(
      "knowledge/orders.xlsx",
      XLSX_MIME,
      { sourceName: "orders.xlsx" },
    )

    expect(document).toMatchObject({
      kind: "tabular",
      sheets: [{ rows: [["15/01/2024"]] }],
    })
  })

  test("prints every digit of a large General integer but keeps explicit formats", async () => {
    const sheet = utils.aoa_to_sheet([
      ["Id", "Padded", "Grouped", "Rate", "Small"],
      [123_456_789_012, 901_234_567, 150_000_000_000, 0.256, 42],
    ])
    sheet.B2.z = "0000000000"
    sheet.C2.z = "#,##0"
    sheet.D2.z = "0%"
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, sheet, "Orders")
    mockStoredFile(
      Buffer.from(write(workbook, { type: "buffer", bookType: "xlsx" })),
    )

    const document = await extractKnowledgeDocument(
      "knowledge/orders.xlsx",
      XLSX_MIME,
      { sourceName: "orders.xlsx" },
    )

    expect(document).toMatchObject({
      kind: "tabular",
      sheets: [
        {
          rows: [
            ["123456789012", "0901234567", "150,000,000,000", "26%", "42"],
          ],
        },
      ],
    })
  })

  test("preserves Markdown structure only for AI File extraction", async () => {
    mockStoredFile(Buffer.from("# Policy\n\n- Keep the receipt"))

    await expect(
      extractKnowledgeDocument("knowledge/policy.md", "text/markdown", {
        sourceName: "policy.md",
      }),
    ).resolves.toEqual({
      kind: "markdown",
      text: "# Policy\n\n- Keep the receipt",
    })
  })

  test("returns other types as prose identical to extractTextFromFile", async () => {
    const buffer = Buffer.from("Line one\r\nLine\ttwo")
    mockStoredFile(buffer)
    const legacy = await extractTextFromFile(
      "knowledge/notes.txt",
      "text/plain",
    )

    await expect(
      extractKnowledgeDocument("knowledge/notes.txt", "text/plain", {
        sourceName: "notes.txt",
      }),
    ).resolves.toEqual({ kind: "prose", text: legacy })
  })

  describe("failures and fallback", () => {
    test("rejects a corrupt XLSX instead of embedding binary garbage", async () => {
      mockStoredFile(
        Buffer.concat([
          Buffer.from("PK\x03\x04"),
          Buffer.from("garbage-bytes-not-a-zip"),
        ]),
      )

      await expect(
        extractKnowledgeDocument("knowledge/broken.xlsx", XLSX_MIME, {
          sourceName: "broken.xlsx",
        }),
      ).rejects.toThrow()
    })

    test("reports a file over the byte limit as a size-limit error", async () => {
      mockStoredFile(Buffer.alloc(2048, "a"))

      const error = await extractKnowledgeDocument(
        "knowledge/big.txt",
        "text/plain",
        { sourceName: "big.txt", maxBytes: 1024 },
      ).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(FileSizeLimitError)
      expect((error as Error).message).toBe("File exceeds 1024 byte limit")
    })

    test("reports a storage failure as a fetch error that keeps its cause", async () => {
      const failure = new Error("socket hang up")
      getObjectStream.mockRejectedValue(failure)

      const error = await extractKnowledgeDocument(
        "knowledge/a.txt",
        "text/plain",
        { sourceName: "a.txt" },
      ).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(FileFetchError)
      expect((error as FileFetchError).cause).toBe(failure)
    })

    test("falls back to legacy prose when building the table fails", async () => {
      const buffer = xlsxBuffer({
        Prices: [
          ["Product", "Price"],
          ["Basic", 199_000],
        ],
      })
      mockStoredFile(buffer)
      const legacy = await extractTextFromFile(
        "knowledge/prices.xlsx",
        XLSX_MIME,
      )
      const sheetToJson = utils.sheet_to_json
      const failure = new Error("table build failed")
      vi.spyOn(utils, "sheet_to_json").mockImplementation(
        (sheet, options?: Sheet2JSONOpts) => {
          if (options?.header === 1) {
            throw failure
          }
          return sheetToJson(sheet, options)
        },
      )

      await expect(
        extractKnowledgeDocument("knowledge/prices.xlsx", XLSX_MIME, {
          sourceName: "prices.xlsx",
        }),
      ).resolves.toEqual({
        kind: "prose",
        text: legacy,
        fallback: { reason: "tabularParseFailed", error: failure },
      })
    })

    test.each([
      ["tabular", {}],
      ["prose", { forceProse: true }],
    ])("rejects a Windows-1252 CSV instead of embedding U+FFFD (%s)", async (_label, extra) => {
      // "Café,10" as Excel's legacy "CSV" writes it: 0xE9 is not valid UTF-8.
      mockStoredFile(
        Buffer.from([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x43, 0x61, 0x66, 0xe9]),
      )

      await expect(
        extractKnowledgeDocument("knowledge/notes.csv", "text/csv", {
          sourceName: "notes.csv",
          ...extra,
        }),
      ).rejects.toThrow("not valid UTF-8")
    })

    test("accepts a UTF-8 CSV with a BOM", async () => {
      mockStoredFile(
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from("Tên,Giá\nCà phê,50000\n"),
        ]),
      )

      const document = await extractKnowledgeDocument(
        "knowledge/notes.csv",
        "text/csv",
        { sourceName: "notes.csv" },
      )

      expect(document.kind).toBe("tabular")
      expect(JSON.stringify(document)).toContain("Cà phê")
      expect(JSON.stringify(document)).not.toContain("�")
    })

    test("returns no sheets when the header row is past the last data row", async () => {
      mockStoredFile(
        xlsxBuffer({
          Prices: [
            ["Product", "Price"],
            ["Basic", 199_000],
          ],
        }),
      )

      await expect(
        extractKnowledgeDocument("knowledge/prices.xlsx", XLSX_MIME, {
          sourceName: "prices.xlsx",
          tabularHeaderRow: 20,
        }),
      ).resolves.toEqual({ kind: "tabular", sheets: [], truncated: false })
    })

    test("keeps Markdown with invalid UTF-8 bytes as markdown", async () => {
      mockStoredFile(
        Buffer.concat([Buffer.from("# Title\nbad "), Buffer.from([0xff])]),
      )

      await expect(
        extractKnowledgeDocument("knowledge/notes.md", "text/markdown", {
          sourceName: "notes.md",
        }),
      ).resolves.toEqual({ kind: "markdown", text: "# Title\nbad �" })
    })
  })

  describe("resource limits", () => {
    // CSV: XLSX itself caps a cell at 32,767 characters.
    test("cuts a 50,000-character cell to the text budget", async () => {
      mockStoredFile(Buffer.from(`Title,Body\nLong,${"x".repeat(50_000)}`))

      const document = await extractKnowledgeDocument(
        "knowledge/notes.csv",
        "text/csv",
        { sourceName: "notes.csv", maxTextChars: 10_000 },
      )

      expect(document).toMatchObject({ kind: "tabular", truncated: true })
      if (document.kind === "tabular") {
        expect(tabularTextLength(document)).toBe(10_000)
      }
    })

    test("stops a 20,000-row workbook exactly at the text budget", async () => {
      mockStoredFile(
        xlsxBuffer({
          Catalog: [
            ["SKU", "Name"],
            ...Array.from({ length: 20_000 }, (_, index) => [
              `sku-${index}`,
              `product ${index}`,
            ]),
          ],
        }),
      )

      const document = await extractKnowledgeDocument(
        "knowledge/catalog.xlsx",
        XLSX_MIME,
        { sourceName: "catalog.xlsx", maxTextChars: 10_000 },
      )

      expect(document).toMatchObject({ kind: "tabular", truncated: true })
      if (document.kind === "tabular") {
        expect(tabularTextLength(document)).toBe(10_000)
        expect(document.sheets[0]?.rows.length).toBeLessThan(20_000)
      }
    })

    test("keeps a table with more rows than a spread argument list can hold", async () => {
      const rowCount = 150_000
      mockStoredFile(
        Buffer.from(
          `SKU\n${Array.from({ length: rowCount }, (_, index) => `s${index}`).join("\n")}`,
        ),
      )

      const document = await extractKnowledgeDocument(
        "knowledge/skus.csv",
        "text/csv",
        { sourceName: "skus.csv" },
      )

      expect(document.kind).toBe("tabular")
      if (document.kind === "tabular") {
        expect(document.sheets[0]?.rows).toHaveLength(rowCount)
      }
    })

    test("cuts Markdown longer than the text budget", async () => {
      mockStoredFile(Buffer.from(`# Title\n${"a".repeat(500)}`))

      const document = await extractKnowledgeDocument(
        "knowledge/long.md",
        "text/markdown",
        { sourceName: "long.md", maxTextChars: 100 },
      )

      expect(document).toEqual({
        kind: "markdown",
        text: `# Title\n${"a".repeat(92)}`,
      })
    })
  })
})
