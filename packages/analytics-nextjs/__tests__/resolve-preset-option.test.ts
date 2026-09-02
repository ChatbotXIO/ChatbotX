import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"
import { describe, expect, test } from "vitest"
import { resolvePresetOption } from "../src/components/date-range-preset-filter"

describe("resolvePresetOption", () => {
  test("labels today's range as the today preset", () => {
    expect(
      resolvePresetOption({
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
      }),
    ).toBe("today")
  })

  test("labels the trailing 7-day window as last7", () => {
    expect(
      resolvePresetOption({
        from: startOfDay(subDays(new Date(), 6)),
        to: endOfDay(new Date()),
      }),
    ).toBe("last7")
  })

  test("labels the trailing 30-day window as last30", () => {
    expect(
      resolvePresetOption({
        from: startOfDay(subDays(new Date(), 29)),
        to: endOfDay(new Date()),
      }),
    ).toBe("last30")
  })

  test("labels the current month as thisMonth", () => {
    expect(
      resolvePresetOption({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
      }),
    ).toBe("thisMonth")
  })

  test("labels the previous month as lastMonth", () => {
    const start = startOfMonth(subMonths(new Date(), 1))
    expect(resolvePresetOption({ from: start, to: endOfMonth(start) })).toBe(
      "lastMonth",
    )
  })

  test("matches by LOCAL calendar day, ignoring intra-day time components", () => {
    // A range whose endpoints land on today's calendar day but at arbitrary
    // times still resolves to `today` — matching is day-granular, not instant.
    const today = new Date()
    expect(
      resolvePresetOption({
        from: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          3,
        ),
        to: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          21,
        ),
      }),
    ).toBe("today")
  })

  test("falls back to custom for a fixed window that matches no preset", () => {
    expect(
      resolvePresetOption({
        from: new Date(2026, 0, 1),
        to: new Date(2026, 0, 3),
      }),
    ).toBe("custom")
  })

  test("resolves lifeTime against the workspace floor when supplied", () => {
    const workspaceCreatedAt = new Date("2024-03-15T00:00:00.000Z")
    expect(
      resolvePresetOption(
        {
          from: startOfDay(workspaceCreatedAt),
          to: endOfDay(new Date()),
        },
        workspaceCreatedAt,
      ),
    ).toBe("lifeTime")
  })
})
