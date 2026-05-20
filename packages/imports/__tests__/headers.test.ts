import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { extractCsvHeaders, parseCsvLine } from "../src/parsers/headers"

describe("parseCsvLine", () => {
  it("splits a plain comma-separated line", () => {
    expect(parseCsvLine("id,name,email")).toEqual(["id", "name", "email"])
  })

  it("trims surrounding whitespace from each field", () => {
    expect(parseCsvLine(" id , name ,  email")).toEqual(["id", "name", "email"])
  })

  it("keeps commas inside a quoted field", () => {
    expect(parseCsvLine('"last, first",age')).toEqual(["last, first", "age"])
  })

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsvLine('"say ""hi""",plain')).toEqual(['say "hi"', "plain"])
  })

  it("handles a quoted field containing both commas and quotes", () => {
    expect(parseCsvLine('"a,""b"",c",d')).toEqual(['a,"b",c', "d"])
  })

  it("returns a single field when there is no comma", () => {
    expect(parseCsvLine("onlyColumn")).toEqual(["onlyColumn"])
  })

  it("returns empty strings for empty fields", () => {
    expect(parseCsvLine("a,,c")).toEqual(["a", "", "c"])
    expect(parseCsvLine(",")).toEqual(["", ""])
  })

  it("returns one empty field for an empty line", () => {
    expect(parseCsvLine("")).toEqual([""])
  })

  it("treats a comma inside quotes as literal even at the end", () => {
    expect(parseCsvLine('first,"trailing,"')).toEqual(["first", "trailing,"])
  })

  it("preserves leading formula characters inside quoted headers", () => {
    expect(parseCsvLine('"=SUM(A1)",name')).toEqual(["=SUM(A1)", "name"])
  })
})

// extractCsvHeaders relies on the browser FileReader, which Node does not
// provide. A minimal stub backed by File.text() reproduces its behavior.
class StubFileReader {
  onload: ((event: { target: { result: string } }) => void) | null = null
  onerror: (() => void) | null = null

  readAsText(file: File): void {
    file.text().then(
      (text) => this.onload?.({ target: { result: text } }),
      () => this.onerror?.(),
    )
  }
}

describe("extractCsvHeaders", () => {
  const originalFileReader = globalThis.FileReader

  beforeAll(() => {
    globalThis.FileReader = StubFileReader as unknown as typeof FileReader
  })

  afterAll(() => {
    globalThis.FileReader = originalFileReader
  })

  const csvFile = (content: string): File =>
    new File([content], "contacts.csv", { type: "text/csv" })

  it("extracts the header fields from the first line", async () => {
    expect(await extractCsvHeaders(csvFile("id,name,email"))).toEqual([
      "id",
      "name",
      "email",
    ])
  })

  it("uses only the first line of multi-line content", async () => {
    expect(await extractCsvHeaders(csvFile("id,name\n1,Alice\n2,Bob"))).toEqual(
      ["id", "name"],
    )
  })

  it("handles CRLF line endings", async () => {
    expect(await extractCsvHeaders(csvFile("id,name\r\n1,Alice"))).toEqual([
      "id",
      "name",
    ])
  })

  it("keeps commas inside a quoted header field", async () => {
    expect(await extractCsvHeaders(csvFile('"last, first",age'))).toEqual([
      "last, first",
      "age",
    ])
  })

  it("strips a UTF-8 BOM from the first header", async () => {
    expect(await extractCsvHeaders(csvFile("﻿id,name"))).toEqual(["id", "name"])
  })

  it("returns a single empty field for empty content", async () => {
    expect(await extractCsvHeaders(csvFile(""))).toEqual([""])
  })
})
