import { describe, expect, test } from "vitest"
import {
  buildMonthGrid,
  dayKey,
  getCalendarQueryRange,
  getMonthRange,
  groupByDay,
  parseMonthParam,
  resolveMonthParam,
} from "@/features/broadcasts/lib/calendar-grid"

describe("parseMonthParam", () => {
  test("parses yyyy-MM to the first of that month", () => {
    expect(dayKey(parseMonthParam("2026-08"))).toBe("2026-08-01")
  })

  test("falls back to the current month for invalid input", () => {
    const now = new Date("2026-08-31T10:00:00")
    expect(dayKey(parseMonthParam("nope", now))).toBe("2026-08-01")
    expect(dayKey(parseMonthParam(null, now))).toBe("2026-08-01")
  })
})

describe("resolveMonthParam", () => {
  test("returns the yyyy-MM string for a valid param", () => {
    expect(resolveMonthParam("2026-08")).toBe("2026-08")
  })

  test("falls back to the current month string for invalid or missing input", () => {
    const now = new Date("2026-08-31T10:00:00")
    expect(resolveMonthParam(null, now)).toBe("2026-08")
    expect(resolveMonthParam("nope", now)).toBe("2026-08")
  })
})

describe("buildMonthGrid", () => {
  test("returns full weeks starting on Monday covering the month", () => {
    const grid = buildMonthGrid(new Date("2026-08-01T00:00:00"))
    expect(grid.every((week) => week.length === 7)).toBe(true)
    expect(dayKey(grid[0][0])).toBe("2026-07-27")
    expect(dayKey((grid.at(-1) as Date[])[6])).toBe("2026-09-06")
  })
})

describe("ranges", () => {
  test("getMonthRange spans the visible grid", () => {
    const { from, to } = getMonthRange(new Date("2026-08-01T00:00:00"))
    expect(dayKey(from)).toBe("2026-07-27")
    expect(dayKey(to)).toBe("2026-09-06")
  })

  test("getCalendarQueryRange pads the grid by two days on each side", () => {
    const { from, to } = getCalendarQueryRange(new Date("2026-08-01T00:00:00"))
    expect(dayKey(from)).toBe("2026-07-25")
    expect(dayKey(to)).toBe("2026-09-08")
  })

  test("padded range includes grid-edge instants from the most extreme browser zones, whatever this process's zone", () => {
    const { from, to } = getCalendarQueryRange(new Date("2026-08-01T00:00:00"))
    // 00:30 on the first visible day for a UTC+14 browser, 23:30 on the last visible day for a UTC-12 browser.
    const firstDayInKiritimati = new Date("2026-07-27T00:30:00+14:00")
    const lastDayInBakerIsland = new Date("2026-09-06T23:30:00-12:00")
    expect(firstDayInKiritimati.getTime()).toBeGreaterThanOrEqual(
      from.getTime(),
    )
    expect(lastDayInBakerIsland.getTime()).toBeLessThanOrEqual(to.getTime())
  })
})

describe("groupByDay", () => {
  test("groups rows by local day", () => {
    const rows = [
      { id: "a", schedulesAt: new Date("2026-08-31T09:00:00") },
      { id: "b", schedulesAt: new Date("2026-08-31T18:30:00") },
      { id: "c", schedulesAt: new Date("2026-09-02T10:00:00") },
    ]
    const grouped = groupByDay(rows)
    expect(grouped.get("2026-08-31")?.map((r) => r.id)).toEqual(["a", "b"])
    expect(grouped.get("2026-09-02")?.map((r) => r.id)).toEqual(["c"])
  })
})
