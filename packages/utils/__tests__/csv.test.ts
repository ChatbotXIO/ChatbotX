import { describe, expect, test } from "vitest"
import { escapeCsvCell, quoteCsvField, toCsvRow, UTF8_BOM } from "../src/csv"

describe("UTF8_BOM", () => {
  test("encodes to the EF BB BF bytes Excel uses to detect UTF-8", () => {
    expect([...Buffer.from(UTF8_BOM, "utf8")]).toEqual([0xef, 0xbb, 0xbf])
  })
})

describe("quoteCsvField", () => {
  test("always quotes and doubles embedded quotes, nothing else", () => {
    expect(quoteCsvField('say "hi"')).toBe('"say ""hi"""')
    // Trusted template values keep a leading + (no formula guard).
    expect(quoteCsvField("+14155550100")).toBe('"+14155550100"')
  })
})

describe("escapeCsvCell", () => {
  test("wraps a plain value in double quotes", () => {
    expect(escapeCsvCell("hello world")).toBe('"hello world"')
  })

  test.each([
    ["", '""'],
    [null, '""'],
    [undefined, '""'],
  ])("renders %j as an empty quoted cell", (value, expected) => {
    expect(escapeCsvCell(value)).toBe(expected)
  })

  test("stringifies numbers", () => {
    expect(escapeCsvCell(42)).toBe('"42"')
    expect(escapeCsvCell(0)).toBe('"0"')
  })

  test("escapes embedded double quotes by doubling them", () => {
    expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""')
  })

  test.each([
    ["line1\nline2", '"line1 line2"'],
    ["line1\r\nline2", '"line1 line2"'],
  ])("flattens a line break in %j to a space", (value, expected) => {
    expect(escapeCsvCell(value)).toBe(expected)
  })

  test("keeps Vietnamese text intact", () => {
    expect(escapeCsvCell("Nguyễn Văn Bình")).toBe('"Nguyễn Văn Bình"')
  })

  test.each([
    ["=1+1", `"'=1+1"`],
    ["+1234", `"'+1234"`],
    ["-cmd", `"'-cmd"`],
    ["@SUM(A1)", `"'@SUM(A1)"`],
    ["\tleading tab", `"'\tleading tab"`],
    ["\rcmd", `"'\rcmd"`],
  ])("guards formula injection: %j is prefixed with a single quote", (value, expected) => {
    expect(escapeCsvCell(value)).toBe(expected)
  })

  test("does not guard a formula character in the middle", () => {
    expect(escapeCsvCell("a=1+1")).toBe('"a=1+1"')
  })

  test("guards a formula that also contains embedded quotes", () => {
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
  })
})

describe("escapeCsvCell in the minimal dialect", () => {
  test("leaves a field bare when nothing needs quoting", () => {
    expect(escapeCsvCell("Ada Lovelace", "minimal")).toBe("Ada Lovelace")
    expect(escapeCsvCell(null, "minimal")).toBe("")
  })

  test.each([
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
  ])("quotes %j because it holds a delimiter or quote", (value, expected) => {
    expect(escapeCsvCell(value, "minimal")).toBe(expected)
  })

  test.each([
    ["line1\nline2", '"line1\nline2"'],
    ["line1\r\nline2", '"line1\r\nline2"'],
  ])("keeps the line break in %j inside a quoted field (RFC 4180)", (value, expected) => {
    expect(escapeCsvCell(value, "minimal")).toBe(expected)
  })

  test.each([
    ["+12025550101", "'+12025550101"],
    ["@cmd", "'@cmd"],
    ["=SUM(1,1)", `"'=SUM(1,1)"`],
    ["\rcmd", `"'\rcmd"`],
    ['="hello"', `"'=""hello"""`],
  ])("still guards formula injection: %j", (value, expected) => {
    expect(escapeCsvCell(value, "minimal")).toBe(expected)
  })
})

describe("toCsvRow", () => {
  test("joins escaped cells with commas and ends with a newline", () => {
    expect(toCsvRow(["Jane", null, 3, "=x"])).toBe(`"Jane","","3","'=x"\n`)
  })

  test("applies the minimal dialect to every cell when asked", () => {
    expect(toCsvRow(["Jane", null, "a,b"], "minimal")).toBe('Jane,,"a,b"\n')
  })

  test("renders an empty row as a bare newline", () => {
    expect(toCsvRow([])).toBe("\n")
  })
})
