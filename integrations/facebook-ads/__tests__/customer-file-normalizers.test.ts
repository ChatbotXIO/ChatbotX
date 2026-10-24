import { describe, expect, test } from "vitest"
import {
  normalizeBirthYear,
  normalizeCity,
  normalizeCountry,
  normalizeCustomerPhone,
  normalizeEmail,
  normalizeGender,
  normalizeMadid,
  normalizeName,
  normalizeState,
  normalizeZip,
  parseDateOfBirth,
} from "../src/customer-file/normalizers"

const NOW = new Date("2026-10-04T00:00:00.000Z")

describe("normalizeEmail", () => {
  test("trims and lowercases", () => {
    expect(normalizeEmail("  ElizabethO@FB.com ")).toBe("elizabetho@fb.com")
  })
  test("rejects non-emails and blanks", () => {
    expect(normalizeEmail("not-an-email")).toBeNull()
    expect(normalizeEmail("   ")).toBeNull()
  })
})

describe("normalizeCustomerPhone", () => {
  test("uses the row country to parse a national number", () => {
    expect(normalizeCustomerPhone("1-(650)-561-5622", "us")).toBe("16505615622")
    expect(normalizeCustomerPhone("0912345678", "vn")).toBe("84912345678")
  })
  test("parses international numbers without a country", () => {
    expect(normalizeCustomerPhone("+44 303 123 7300", null)).toBe(
      "443031237300",
    )
    // Meta's own example from the Marketing Messages guide.
    expect(normalizeCustomerPhone("(+84) 091-2345678", null)).toBe(
      "84912345678",
    )
  })
  test("falls back to digits when the number has a calling code but no +", () => {
    expect(normalizeCustomerPhone("1-(650)-561-5622", null)).toBe("16505615622")
  })
  test("drops a local number with no country instead of guessing", () => {
    expect(normalizeCustomerPhone("0912345678", null)).toBeNull()
  })
  test("blank is null", () => {
    expect(normalizeCustomerPhone("  ", "us")).toBeNull()
  })
})

describe("names and places", () => {
  test("names: lowercase, strip punctuation and digits, keep Unicode letters", () => {
    expect(normalizeName("  O'Brien-Smith3 ")).toBe("obriensmith")
    expect(normalizeName("Nguyễn Văn")).toBe("nguyễn văn")
    expect(normalizeName("Mary   Ann")).toBe("mary ann")
    expect(normalizeName("!!!")).toBeNull()
  })
  test("city also removes whitespace", () => {
    expect(normalizeCity("Menlo Park")).toBe("menlopark")
    expect(normalizeCity("São Paulo")).toBe("sãopaulo")
  })
  test("state keeps letters only, lowercase", () => {
    expect(normalizeState("CA")).toBe("ca")
    expect(normalizeState(" N.Y. ")).toBe("ny")
  })
  test("zip: lowercase, no whitespace, US keeps 5 digits", () => {
    expect(normalizeZip("90001-4656", "us")).toBe("90001")
    expect(normalizeZip("90001-4656", null)).toBe("90001-4656")
    expect(normalizeZip("90001 4656", "us")).toBe("90001")
    expect(normalizeZip("SW1A 1AA", "gb")).toBe("sw1a1aa")
    expect(normalizeZip("", "us")).toBeNull()
  })
  test("country: 2-letter lowercase ISO only", () => {
    expect(normalizeCountry(" US ")).toBe("us")
    expect(normalizeCountry("USA")).toBeNull()
  })
})

describe("dates of birth", () => {
  test("MM/DD/YY pivots on the current year", () => {
    expect(parseDateOfBirth("10/21/68", NOW)).toEqual({
      doby: "1968",
      dobm: "10",
      dobd: "21",
    })
    expect(parseDateOfBirth("01/02/05", NOW)).toEqual({
      doby: "2005",
      dobm: "01",
      dobd: "02",
    })
  })
  test("MM/DD/YYYY and YYYY-MM-DD", () => {
    expect(parseDateOfBirth("9/1/1978", NOW)).toEqual({
      doby: "1978",
      dobm: "09",
      dobd: "01",
    })
    expect(parseDateOfBirth("1982-11-21", NOW)).toEqual({
      doby: "1982",
      dobm: "11",
      dobd: "21",
    })
  })
  test("invalid dates are null", () => {
    expect(parseDateOfBirth("02/30/1990", NOW)).toBeNull()
    expect(parseDateOfBirth("13/01/1990", NOW)).toBeNull()
    expect(parseDateOfBirth("1899-01-01", NOW)).toBeNull()
    expect(parseDateOfBirth("2030-01-01", NOW)).toBeNull()
    expect(parseDateOfBirth("yesterday", NOW)).toBeNull()
  })
  test("birth year: 4 digits between 1900 and now", () => {
    expect(normalizeBirthYear("1978", NOW)).toBe("1978")
    expect(normalizeBirthYear("78", NOW)).toBeNull()
    expect(normalizeBirthYear("2099", NOW)).toBeNull()
  })
})

describe("gender and madid", () => {
  test("gender maps to m/f", () => {
    expect(normalizeGender("F")).toBe("f")
    expect(normalizeGender("male")).toBe("m")
    expect(normalizeGender("x")).toBeNull()
  })
  test("madid lowercases and keeps hyphens", () => {
    expect(normalizeMadid(" BEBE52E7-03EE-455A-B3C4-E57283966239 ")).toBe(
      "bebe52e7-03ee-455a-b3c4-e57283966239",
    )
  })
})
