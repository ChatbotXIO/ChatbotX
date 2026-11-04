import { describe, expect, test } from "vitest"
import { formatDateRange } from "../src/form-answer-format"

describe("formatDateRange", () => {
  test("a CalendarPicker range answer becomes start - end", () => {
    expect(
      formatDateRange({ "start-date": "2024-10-21", "end-date": "2024-10-25" }),
    ).toBe("2024-10-21 - 2024-10-25")
  })

  test.each([
    ["a date string", "2024-10-21"],
    ["a list", ["2024-10-21", "2024-10-25"]],
    ["half a range", { "start-date": "2024-10-21" }],
    ["a non-string end", { "start-date": "2024-10-21", "end-date": 5 }],
    ["null", null],
  ])("%s is not a range", (_label, value) => {
    expect(formatDateRange(value)).toBeNull()
  })
})
