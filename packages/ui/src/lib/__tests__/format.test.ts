import { describe, expect, test } from "vitest"
import { formatDate } from "../format"

describe("formatDate", () => {
  test("returns an empty string for a falsy date", () => {
    expect(formatDate(undefined)).toBe("")
  })

  test("formats using the default en-US locale when none is provided", () => {
    expect(formatDate(new Date(2026, 0, 15))).toBe("January 15, 2026")
  })

  test("formats using the given locale", () => {
    expect(formatDate(new Date(2026, 0, 15), { locale: "de" })).toContain(
      "Januar",
    )
  })

  test("merges custom Intl.DateTimeFormatOptions with the locale", () => {
    expect(
      formatDate(new Date(2026, 0, 15), { month: "short", locale: "de" }),
    ).toBe("15. Jan. 2026")
  })

  test("returns an empty string when the date cannot be parsed", () => {
    expect(formatDate("not-a-date")).toBe("")
  })
})
