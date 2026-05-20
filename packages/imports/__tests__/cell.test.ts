import { describe, expect, it } from "vitest"
import {
  cleanCell,
  cleanEmail,
  cleanPhone,
  cleanText,
} from "../src/parsers/cell"

describe("cleanCell", () => {
  it("returns undefined for non-string input", () => {
    expect(cleanCell(123)).toBeUndefined()
    expect(cleanCell(null)).toBeUndefined()
    expect(cleanCell(undefined)).toBeUndefined()
    expect(cleanCell({})).toBeUndefined()
  })

  it("trims surrounding whitespace", () => {
    expect(cleanCell("  hello  ")).toBe("hello")
  })

  it("returns undefined for a blank or whitespace-only string", () => {
    expect(cleanCell("")).toBeUndefined()
    expect(cleanCell("   ")).toBeUndefined()
  })

  it("truncates to the given max length", () => {
    expect(cleanCell("abcdef", 3)).toBe("abc")
  })
})

describe("cleanText", () => {
  it("stores formula-prefixed values raw (escaping happens at export)", () => {
    expect(cleanText("=SUM(A1)")).toBe("=SUM(A1)")
    expect(cleanText("+1234")).toBe("+1234")
    expect(cleanText("-cmd")).toBe("-cmd")
    expect(cleanText("@handle")).toBe("@handle")
  })

  it("trims and drops empty values like cleanCell", () => {
    expect(cleanText("  spaced  ")).toBe("spaced")
    expect(cleanText("   ")).toBeUndefined()
  })
})

describe("cleanEmail", () => {
  it("lowercases a valid email", () => {
    expect(cleanEmail("Foo@Bar.COM")).toBe("foo@bar.com")
  })

  it("returns undefined for an invalid email", () => {
    expect(cleanEmail("not-an-email")).toBeUndefined()
    expect(cleanEmail("missing@domain")).toBeUndefined()
    expect(cleanEmail("")).toBeUndefined()
  })

  it("returns undefined for non-string input", () => {
    expect(cleanEmail(42)).toBeUndefined()
  })
})

describe("cleanPhone", () => {
  it("strips formatting and keeps a leading plus", () => {
    expect(cleanPhone("+1 (555) 123-4567")).toBe("+15551234567")
  })

  it("returns undefined for a value below the minimum digit count", () => {
    expect(cleanPhone("123")).toBeUndefined()
  })

  it("returns undefined for a non-phone value", () => {
    expect(cleanPhone("abcdef")).toBeUndefined()
    expect(cleanPhone("")).toBeUndefined()
  })

  it("returns undefined for non-string input", () => {
    expect(cleanPhone(5_551_234)).toBeUndefined()
  })
})
