import { describe, expect, test } from "vitest"
import {
  buildMonthGrid,
  buildRangeDays,
  buildWeekDays,
  calendarRangeConfig,
  DEFAULT_CUSTOM_RANGE_DAYS,
  dayKey,
  getCalendarQueryRange,
  groupByDay,
  MAX_CUSTOM_RANGE_DAYS,
  parseDateParam,
  parseEndDateParam,
  resolveDateParam,
  resolveEndDateParam,
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

describe("parseEndDateParam", () => {
  const anchor = new Date("2026-08-31T00:00:00")

  test("parses a valid yyyy-MM-dd on/after the anchor", () => {
    expect(dayKey(parseEndDateParam("2026-09-10", anchor))).toBe("2026-09-10")
  })

  test("defaults to anchor + (DEFAULT_CUSTOM_RANGE_DAYS - 1) when null", () => {
    const expected = dayKey(
      new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + (DEFAULT_CUSTOM_RANGE_DAYS - 1),
      ),
    )
    expect(dayKey(parseEndDateParam(null, anchor))).toBe(expected)
  })

  test("defaults when the value is not a valid date string", () => {
    const expected = dayKey(
      new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + (DEFAULT_CUSTOM_RANGE_DAYS - 1),
      ),
    )
    expect(dayKey(parseEndDateParam("not-a-date", anchor))).toBe(expected)
  })

  test("defaults when the value is before the anchor", () => {
    const expected = dayKey(
      new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + (DEFAULT_CUSTOM_RANGE_DAYS - 1),
      ),
    )
    expect(dayKey(parseEndDateParam("2026-08-01", anchor))).toBe(expected)
  })

  test("clamps to MAX_CUSTOM_RANGE_DAYS - 1 days after the anchor", () => {
    const farFuture = "2030-01-01"
    const expected = dayKey(
      new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + (MAX_CUSTOM_RANGE_DAYS - 1),
      ),
    )
    expect(dayKey(parseEndDateParam(farFuture, anchor))).toBe(expected)
  })
})

describe("resolveEndDateParam", () => {
  test("returns the yyyy-MM-dd string for a valid endDate on/after the anchor", () => {
    expect(resolveEndDateParam("2026-09-10", "2026-08-31")).toBe("2026-09-10")
  })

  test("falls back to anchor + default span for invalid or missing endDate", () => {
    expect(resolveEndDateParam(null, "2026-08-31")).toBe("2026-09-06")
    expect(resolveEndDateParam("nope", "2026-08-31")).toBe("2026-09-06")
    expect(resolveEndDateParam("2026-08-01", "2026-08-31")).toBe("2026-09-06")
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

describe("buildRangeDays", () => {
  test("returns an inclusive list of days between anchor and endAnchor", () => {
    const days = buildRangeDays(
      new Date("2026-08-31T00:00:00"),
      new Date("2026-09-03T00:00:00"),
    )
    expect(days.length).toBe(4)
    expect(dayKey(days[0])).toBe("2026-08-31")
    expect(dayKey(days.at(-1) as Date)).toBe("2026-09-03")
  })

  test("returns a single day when anchor and endAnchor are the same day", () => {
    const anchor = new Date("2026-09-02T00:00:00")
    const days = buildRangeDays(anchor, anchor)
    expect(days.length).toBe(1)
    expect(dayKey(days[0])).toBe("2026-09-02")
  })
})

describe("calendarRangeConfig", () => {
  const endAnchorPlaceholder = new Date("2026-08-01T00:00:00")

  test("month getVisibleInterval spans the visible grid", () => {
    const { from, to } = calendarRangeConfig.month.getVisibleInterval(
      new Date("2026-08-01T00:00:00"),
      endAnchorPlaceholder,
    )
    expect(dayKey(from)).toBe("2026-07-27")
    expect(dayKey(to)).toBe("2026-09-06")
  })

  test("week getVisibleInterval spans Monday to Sunday around the anchor", () => {
    const { from, to } = calendarRangeConfig.week.getVisibleInterval(
      new Date("2026-09-02T00:00:00"),
      endAnchorPlaceholder,
    )
    expect(dayKey(from)).toBe("2026-08-31")
    expect(dayKey(to)).toBe("2026-09-06")
  })

  test("day getVisibleInterval spans the start and end of the anchor day", () => {
    const anchor = new Date("2026-09-02T12:00:00")
    const { from, to } = calendarRangeConfig.day.getVisibleInterval(
      anchor,
      endAnchorPlaceholder,
    )
    expect(from.getHours()).toBe(0)
    expect(from.getMinutes()).toBe(0)
    expect(dayKey(from)).toBe("2026-09-02")
    expect(dayKey(to)).toBe("2026-09-02")
    expect(to.getHours()).toBe(23)
    expect(to.getMinutes()).toBe(59)
  })

  test("custom getVisibleInterval spans start-of-anchor to end-of-endAnchor", () => {
    const anchor = new Date("2026-08-31T00:00:00")
    const endAnchor = new Date("2026-09-06T00:00:00")
    const { from, to } = calendarRangeConfig.custom.getVisibleInterval(
      anchor,
      endAnchor,
    )
    expect(dayKey(from)).toBe("2026-08-31")
    expect(from.getHours()).toBe(0)
    expect(dayKey(to)).toBe("2026-09-06")
    expect(to.getHours()).toBe(23)
    expect(to.getMinutes()).toBe(59)
  })

  test("month step moves the anchor by whole months and returns endDate null", () => {
    const anchor = new Date("2026-08-15T00:00:00")
    const forward = calendarRangeConfig.month.step(
      anchor,
      endAnchorPlaceholder,
      1,
    )
    expect(dayKey(forward.date)).toBe("2026-09-15")
    expect(forward.endDate).toBeNull()
    const backward = calendarRangeConfig.month.step(
      anchor,
      endAnchorPlaceholder,
      -1,
    )
    expect(dayKey(backward.date)).toBe("2026-07-15")
    expect(backward.endDate).toBeNull()
  })

  test("week step moves the anchor by 7 days and returns endDate null", () => {
    const anchor = new Date("2026-09-02T00:00:00")
    const forward = calendarRangeConfig.week.step(
      anchor,
      endAnchorPlaceholder,
      1,
    )
    expect(dayKey(forward.date)).toBe("2026-09-09")
    expect(forward.endDate).toBeNull()
    const backward = calendarRangeConfig.week.step(
      anchor,
      endAnchorPlaceholder,
      -1,
    )
    expect(dayKey(backward.date)).toBe("2026-08-26")
    expect(backward.endDate).toBeNull()
  })

  test("day step moves the anchor by 1 day and returns endDate null", () => {
    const anchor = new Date("2026-09-02T00:00:00")
    const forward = calendarRangeConfig.day.step(
      anchor,
      endAnchorPlaceholder,
      1,
    )
    expect(dayKey(forward.date)).toBe("2026-09-03")
    expect(forward.endDate).toBeNull()
    const backward = calendarRangeConfig.day.step(
      anchor,
      endAnchorPlaceholder,
      -1,
    )
    expect(dayKey(backward.date)).toBe("2026-09-01")
    expect(backward.endDate).toBeNull()
  })

  test("custom step shifts both anchors forward by the span length", () => {
    const anchor = new Date("2026-08-31T00:00:00")
    const endAnchor = new Date("2026-09-02T00:00:00") // span = 3 days
    const forward = calendarRangeConfig.custom.step(anchor, endAnchor, 1)
    expect(dayKey(forward.date)).toBe("2026-09-03")
    expect(forward.endDate && dayKey(forward.endDate)).toBe("2026-09-05")
  })

  test("custom step shifts both anchors backward by the span length", () => {
    const anchor = new Date("2026-08-31T00:00:00")
    const endAnchor = new Date("2026-09-02T00:00:00") // span = 3 days
    const backward = calendarRangeConfig.custom.step(anchor, endAnchor, -1)
    expect(dayKey(backward.date)).toBe("2026-08-28")
    expect(backward.endDate && dayKey(backward.endDate)).toBe("2026-08-30")
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
    expect(calendarRangeConfig.custom.labelKey).toBe(
      "broadcasts.calendar.ranges.custom",
    )
  })
})

describe("getCalendarQueryRange", () => {
  const endAnchorPlaceholder = new Date("2026-08-01T00:00:00")

  test("pads the month grid by two days on each side", () => {
    const { from, to } = getCalendarQueryRange(
      "month",
      new Date("2026-08-01T00:00:00"),
      endAnchorPlaceholder,
    )
    expect(dayKey(from)).toBe("2026-07-25")
    expect(dayKey(to)).toBe("2026-09-08")
  })

  test("pads the week range by two days on each side", () => {
    const { from, to } = getCalendarQueryRange(
      "week",
      new Date("2026-09-02T00:00:00"),
      endAnchorPlaceholder,
    )
    expect(dayKey(from)).toBe("2026-08-29")
    expect(dayKey(to)).toBe("2026-09-08")
  })

  test("pads the day range by two days on each side", () => {
    const { from, to } = getCalendarQueryRange(
      "day",
      new Date("2026-09-02T00:00:00"),
      endAnchorPlaceholder,
    )
    expect(dayKey(from)).toBe("2026-08-31")
    expect(dayKey(to)).toBe("2026-09-04")
  })

  test("pads the custom range by two days on each side", () => {
    const { from, to } = getCalendarQueryRange(
      "custom",
      new Date("2026-08-31T00:00:00"),
      new Date("2026-09-06T00:00:00"),
    )
    expect(dayKey(from)).toBe("2026-08-29")
    expect(dayKey(to)).toBe("2026-09-08")
  })

  test("padded month range includes grid-edge instants from the most extreme browser zones, whatever this process's zone", () => {
    const { from, to } = getCalendarQueryRange(
      "month",
      new Date("2026-08-01T00:00:00"),
      endAnchorPlaceholder,
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
