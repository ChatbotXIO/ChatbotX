import { describe, expect, test } from "vitest"
import {
  buildMonthGrid,
  buildWeekDays,
  calendarRangeConfig,
  dayKey,
  getCalendarQueryRange,
  groupByDay,
  parseDateParam,
  resolveDateParam,
  sortBySchedulesAt,
} from "@/features/broadcasts/lib/calendar-grid"

describe("parseDateParam", () => {
  test("parses yyyy-MM-dd to that day", () => {
    expect(dayKey(parseDateParam("2026-08-31"))).toBe("2026-08-31")
  })

  test("falls back to today for invalid or missing input", () => {
    const now = new Date("2026-08-31T10:00:00")
    expect(dayKey(parseDateParam("nope", now))).toBe("2026-08-31")
    expect(dayKey(parseDateParam(null, now))).toBe("2026-08-31")
  })
})

describe("resolveDateParam", () => {
  test("returns the yyyy-MM-dd string for a valid param", () => {
    expect(resolveDateParam("2026-08-31")).toBe("2026-08-31")
  })

  test("falls back to today's string for invalid or missing input", () => {
    const now = new Date("2026-08-31T10:00:00")
    expect(resolveDateParam(null, now)).toBe("2026-08-31")
    expect(resolveDateParam("nope", now)).toBe("2026-08-31")
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

describe("buildWeekDays", () => {
  test("returns 7 days Monday through Sunday", () => {
    const days = buildWeekDays(new Date("2026-09-02T00:00:00"))
    expect(days.length).toBe(7)
    expect(dayKey(days[0])).toBe("2026-08-31")
    expect(dayKey(days[6])).toBe("2026-09-06")
  })
})

describe("calendarRangeConfig", () => {
  test("month getVisibleInterval spans the visible grid", () => {
    const { from, to } = calendarRangeConfig.month.getVisibleInterval(
      new Date("2026-08-01T00:00:00"),
    )
    expect(dayKey(from)).toBe("2026-07-27")
    expect(dayKey(to)).toBe("2026-09-06")
  })

  test("week getVisibleInterval spans Monday to Sunday around the anchor", () => {
    const { from, to } = calendarRangeConfig.week.getVisibleInterval(
      new Date("2026-09-02T00:00:00"),
    )
    expect(dayKey(from)).toBe("2026-08-31")
    expect(dayKey(to)).toBe("2026-09-06")
  })

  test("day getVisibleInterval spans the start and end of the anchor day", () => {
    const anchor = new Date("2026-09-02T12:00:00")
    const { from, to } = calendarRangeConfig.day.getVisibleInterval(anchor)
    expect(from.getHours()).toBe(0)
    expect(from.getMinutes()).toBe(0)
    expect(dayKey(from)).toBe("2026-09-02")
    expect(dayKey(to)).toBe("2026-09-02")
    expect(to.getHours()).toBe(23)
    expect(to.getMinutes()).toBe(59)
  })

  test("month step moves the anchor by whole months", () => {
    const anchor = new Date("2026-08-15T00:00:00")
    expect(dayKey(calendarRangeConfig.month.step(anchor, 1))).toBe("2026-09-15")
    expect(dayKey(calendarRangeConfig.month.step(anchor, -1))).toBe(
      "2026-07-15",
    )
  })

  test("week step moves the anchor by 7 days", () => {
    const anchor = new Date("2026-09-02T00:00:00")
    expect(dayKey(calendarRangeConfig.week.step(anchor, 1))).toBe("2026-09-09")
    expect(dayKey(calendarRangeConfig.week.step(anchor, -1))).toBe("2026-08-26")
  })

  test("day step moves the anchor by 1 day", () => {
    const anchor = new Date("2026-09-02T00:00:00")
    expect(dayKey(calendarRangeConfig.day.step(anchor, 1))).toBe("2026-09-03")
    expect(dayKey(calendarRangeConfig.day.step(anchor, -1))).toBe("2026-09-01")
  })

  test("each range exposes its i18n label key", () => {
    expect(calendarRangeConfig.month.labelKey).toBe(
      "broadcasts.calendar.ranges.month",
    )
    expect(calendarRangeConfig.week.labelKey).toBe(
      "broadcasts.calendar.ranges.week",
    )
    expect(calendarRangeConfig.day.labelKey).toBe(
      "broadcasts.calendar.ranges.day",
    )
  })
})

describe("getCalendarQueryRange", () => {
  test("pads the month grid by two days on each side", () => {
    const { from, to } = getCalendarQueryRange(
      "month",
      new Date("2026-08-01T00:00:00"),
    )
    expect(dayKey(from)).toBe("2026-07-25")
    expect(dayKey(to)).toBe("2026-09-08")
  })

  test("pads the week range by two days on each side", () => {
    const { from, to } = getCalendarQueryRange(
      "week",
      new Date("2026-09-02T00:00:00"),
    )
    expect(dayKey(from)).toBe("2026-08-29")
    expect(dayKey(to)).toBe("2026-09-08")
  })

  test("pads the day range by two days on each side", () => {
    const { from, to } = getCalendarQueryRange(
      "day",
      new Date("2026-09-02T00:00:00"),
    )
    expect(dayKey(from)).toBe("2026-08-31")
    expect(dayKey(to)).toBe("2026-09-04")
  })

  test("padded month range includes grid-edge instants from the most extreme browser zones, whatever this process's zone", () => {
    const { from, to } = getCalendarQueryRange(
      "month",
      new Date("2026-08-01T00:00:00"),
    )
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

describe("sortBySchedulesAt", () => {
  test("sorts rows ascending by schedulesAt without mutating the input", () => {
    const rows = [
      { id: "b", schedulesAt: new Date("2026-08-31T18:30:00") },
      { id: "a", schedulesAt: new Date("2026-08-31T09:00:00") },
      { id: "c", schedulesAt: new Date("2026-09-02T10:00:00") },
    ]
    const original = [...rows]
    const sorted = sortBySchedulesAt(rows)
    expect(sorted.map((r) => r.id)).toEqual(["a", "b", "c"])
    expect(rows).toEqual(original)
  })
})
