import { describe, expect, test } from "vitest"
import { isMatchedRow } from "../src/integration/handlers/operator-handler"

const headers = ["timestamp", "messenger id", "aaa"]

const lookup = (
  value: string,
  operator = "is",
  mode: "AND" | "OR" = "AND",
  column = "aaa",
) => ({
  mode,
  conditions: [{ value, column, operator: operator as never }],
})

describe("isMatchedRow", () => {
  test('matches "is" despite a trailing space on the lookup value', () => {
    // Regression: the rich-text editor serialized "{{Phone}} " with a trailing
    // space, so the resolved value was "+84349566501 " and never matched.
    const row = ["2025-08-21", "1713491048750426", "+84349566501"]
    expect(isMatchedRow(headers, row, lookup("+84349566501 "))).toBe(true)
  })

  test('matches "is" despite surrounding whitespace on the cell value', () => {
    const row = ["2025-08-21", "1713491048750426", "  +84349566501 "]
    expect(isMatchedRow(headers, row, lookup("+84349566501"))).toBe(true)
  })

  test('does not match "is" when the trimmed values differ', () => {
    const row = ["2025-08-21", "1713491048750426", "+84349566500"]
    expect(isMatchedRow(headers, row, lookup("+84349566501"))).toBe(false)
  })

  test("returns false when the lookup column is missing from the headers", () => {
    const row = ["2025-08-21", "1713491048750426", "+84349566501"]
    expect(
      isMatchedRow(
        headers,
        row,
        lookup("+84349566501", "is", "AND", "missing"),
      ),
    ).toBe(false)
  })

  test('supports "contains" with whitespace tolerance', () => {
    const row = ["2025-08-21", "1713491048750426", "prefix +84349566501 suffix"]
    expect(
      isMatchedRow(headers, row, lookup(" 84349566501 ", "contains")),
    ).toBe(true)
  })
})
