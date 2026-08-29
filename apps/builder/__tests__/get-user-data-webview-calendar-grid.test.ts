import { describe, expect, test } from "vitest"
import {
  buildCalendarGrid,
  buildYearOptions,
  isSameCalendarDay,
  withCalendarDay,
  withTime,
} from "@/features/get-user-data-webview/lib/calendar-grid"

describe("buildCalendarGrid", () => {
  test("always yields a fixed 6x7 grid starting on Sunday", () => {
    // August 2026 starts on a Saturday.
    const cells = buildCalendarGrid(2026, 7)

    expect(cells).toHaveLength(42)
    expect(cells[0]?.date.getDay()).toBe(0)
    expect(cells.at(-1)?.date.getDay()).toBe(6)
  })

  test("flags adjacent-month padding days", () => {
    const cells = buildCalendarGrid(2026, 7)

    // Aug 1, 2026 is a Saturday → 6 July padding days lead the grid.
    const leading = cells.slice(0, 6)
    expect(leading.every((cell) => !cell.inCurrentMonth)).toBe(true)
    expect(leading[0]?.date.getDate()).toBe(26)

    const firstOfMonth = cells[6]
    expect(firstOfMonth?.date.getDate()).toBe(1)
    expect(firstOfMonth?.inCurrentMonth).toBe(true)
  })

  test("handles February in a leap year without dropping days", () => {
    const cells = buildCalendarGrid(2024, 1)
    const februaryDays = cells.filter((cell) => cell.inCurrentMonth)
    expect(februaryDays).toHaveLength(29)
  })
})

describe("withCalendarDay / withTime", () => {
  test("withCalendarDay swaps only the day and keeps the picked time", () => {
    const value = new Date(2026, 7, 21, 14, 30)
    const next = withCalendarDay(value, new Date(2026, 8, 3))

    expect(next.getFullYear()).toBe(2026)
    expect(next.getMonth()).toBe(8)
    expect(next.getDate()).toBe(3)
    expect(next.getHours()).toBe(14)
    expect(next.getMinutes()).toBe(30)
    // Immutable: the original is untouched.
    expect(value.getMonth()).toBe(7)
  })

  test("withTime swaps only the time and keeps the picked day", () => {
    const value = new Date(2026, 7, 21, 14, 30)
    const next = withTime(value, 0, 7)

    expect(next.getDate()).toBe(21)
    expect(next.getHours()).toBe(0)
    expect(next.getMinutes()).toBe(7)
    expect(value.getHours()).toBe(14)
  })
})

describe("buildYearOptions", () => {
  test("spans a century back (birthdays) and a decade forward (scheduling)", () => {
    const years = buildYearOptions(2026)

    expect(years[0]).toBe(1926)
    expect(years.at(-1)).toBe(2036)
    expect(years).toContain(2026)
  })
})

describe("isSameCalendarDay", () => {
  test("compares the calendar day, ignoring the time of day", () => {
    expect(
      isSameCalendarDay(new Date(2026, 7, 21, 0, 1), new Date(2026, 7, 21, 23)),
    ).toBe(true)
    expect(
      isSameCalendarDay(new Date(2026, 7, 21), new Date(2026, 7, 22)),
    ).toBe(false)
  })
})
