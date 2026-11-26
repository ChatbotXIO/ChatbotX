import { describe, expect, test } from "vitest"
import {
  changeDirection,
  formatChangePercent,
  formatCount,
  formatGain,
  formatScore,
  NO_VALUE,
} from "@/features/post-analytics/lib/analytics-format"
import {
  clampRange,
  fromDayKey,
  resolveFilterRange,
  toDayKey,
} from "@/features/post-analytics/lib/day-range"
import {
  seriesChannel,
  seriesLabel,
} from "@/features/post-analytics/lib/group-labels"
import { buildHeatmap } from "@/features/post-analytics/lib/heatmap"
import { toAnalyticsScope } from "@/features/post-analytics/lib/search-params"
import {
  enumerateDays,
  MAX_CHART_SERIES,
  mergeSeries,
  OTHER_SERIES_KEY,
} from "@/features/post-analytics/lib/series"
import {
  hourName,
  weekdayName,
} from "@/features/post-analytics/lib/time-labels"

describe("number formatting", () => {
  test("writes small counts in full and large ones compactly", () => {
    expect(formatCount(9999, "en")).toBe("9,999")
    expect(formatCount(12_300, "en")).toBe("12.3K")
  })

  test("always signs a gain except zero", () => {
    expect(formatGain(5, "en")).toBe("+5")
    expect(formatGain(-5, "en")).toBe("-5")
    expect(formatGain(0, "en")).toBe("0")
  })

  test("formats a change as a signed percent and null as a dash", () => {
    expect(formatChangePercent(12.34, "en")).toBe("+12.3%")
    expect(formatChangePercent(-4, "en")).toBe("-4%")
    expect(formatChangePercent(0, "en")).toBe("0%")
    expect(formatChangePercent(null, "en")).toBe(NO_VALUE)
  })

  test("maps a change to a direction, null being unknown", () => {
    expect(changeDirection(3)).toBe("up")
    expect(changeDirection(-0.1)).toBe("down")
    expect(changeDirection(0)).toBe("flat")
    expect(changeDirection(null)).toBe("unknown")
  })

  test("writes a score with one decimal", () => {
    expect(formatScore(1, "en")).toBe("1.0")
    expect(formatScore(1.46, "en")).toBe("1.5")
  })
})

describe("enumerateDays", () => {
  test("lists every day of the range inclusive, across a month end", () => {
    expect(enumerateDays("2026-02-27", "2026-03-02")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ])
  })

  test("is empty for an inverted or invalid range", () => {
    expect(enumerateDays("2026-03-02", "2026-03-01")).toEqual([])
    expect(enumerateDays("nope", "2026-03-01")).toEqual([])
  })
})

describe("mergeSeries", () => {
  test("lines the series up on the union of their days, a missing day counting 0", () => {
    const merged = mergeSeries([
      { key: "a", points: [{ day: "2026-03-02", gain: 3 }] },
      {
        key: "b",
        points: [
          { day: "2026-03-01", gain: 1 },
          { day: "2026-03-04", gain: -2 },
        ],
      },
    ])
    expect(merged.keys).toEqual(["a", "b"])
    expect(merged.rows.map((row) => row.day)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-04",
    ])
    expect(merged.rows.map((row) => row.a)).toEqual([0, 3, 0])
    expect(merged.rows.map((row) => row.b)).toEqual([1, 0, -2])
    expect(merged.totals).toEqual({ a: 3, b: -1 })
    expect(merged.total).toBe(2)
  })

  test("orders series by the size of their total", () => {
    const merged = mergeSeries([
      { key: "small", points: [{ day: "2026-03-01", gain: 1 }] },
      { key: "big", points: [{ day: "2026-03-01", gain: 9 }] },
    ])
    expect(merged.keys).toEqual(["big", "small"])
  })

  test("folds the smallest series into one other series past the limit", () => {
    const series = Array.from({ length: MAX_CHART_SERIES + 2 }, (_, index) => ({
      key: `s${index}`,
      points: [{ day: "2026-03-01", gain: 100 - index }],
    }))
    const merged = mergeSeries(series)
    expect(merged.keys).toHaveLength(MAX_CHART_SERIES)
    expect(merged.keys.at(-1)).toBe(OTHER_SERIES_KEY)
    const folded = series.slice(MAX_CHART_SERIES - 1)
    expect(merged.totals[OTHER_SERIES_KEY]).toBe(
      folded.reduce((sum, entry) => sum + (entry.points[0]?.gain ?? 0), 0),
    )
    expect(merged.total).toBe(
      series.reduce((sum, entry) => sum + (entry.points[0]?.gain ?? 0), 0),
    )
  })

  test("returns no rows for an empty series list", () => {
    expect(mergeSeries([])).toMatchObject({
      keys: [],
      rows: [],
      total: 0,
    })
  })
})

describe("buildHeatmap", () => {
  const slots = [
    { hour: 9, sampleSize: 4, score: 2, weekday: 1 },
    { hour: 18, sampleSize: 3, score: 0.5, weekday: 7 },
  ]

  test("is 7 weekdays of 24 hours with Monday first", () => {
    const grid = buildHeatmap(slots, [])
    expect(grid).toHaveLength(7)
    expect(grid.every((row) => row.length === 24)).toBe(true)
    expect(grid[0]?.[0]).toMatchObject({ hour: 0, weekday: 1 })
    expect(grid[6]?.[23]).toMatchObject({ hour: 23, weekday: 7 })
  })

  test("leaves slots without posts empty and levels the rest against the best", () => {
    const grid = buildHeatmap(slots, [])
    expect(grid[0]?.[8]).toMatchObject({ level: 0, sampleSize: 0, score: null })
    expect(grid[0]?.[9]).toMatchObject({ level: 4, sampleSize: 4, score: 2 })
    expect(grid[6]?.[18]?.level).toBe(1)
  })

  test("marks the ranked slots", () => {
    const grid = buildHeatmap(slots, [
      slots[0] ?? { hour: 0, sampleSize: 1, score: 1, weekday: 1 },
    ])
    expect(grid[0]?.[9]?.isTop).toBe(true)
    expect(grid[6]?.[18]?.isTop).toBe(false)
  })

  test("is all empty without slots", () => {
    expect(
      buildHeatmap([], [])
        .flat()
        .every((cell) => cell.level === 0),
    ).toBe(true)
  })
})

describe("day range", () => {
  test("round-trips a local day", () => {
    expect(toDayKey(fromDayKey("2026-03-05") ?? new Date(0))).toBe("2026-03-05")
    expect(fromDayKey(null)).toBeUndefined()
    expect(fromDayKey("garbage")).toBeUndefined()
  })

  test("does not send a day after today", () => {
    const today = new Date("2026-03-10T12:00:00")
    expect(
      clampRange(
        {
          from: new Date("2026-03-01T00:00:00"),
          to: new Date("2026-03-31T23:59:59"),
        },
        today,
      ),
    ).toEqual({ from: "2026-03-01", to: "2026-03-10" })
  })

  test("the end is clamped to the workspace's day, not the browser's", () => {
    // The workspace is already on the 11th while the browser still shows the 10th.
    expect(
      clampRange(
        {
          from: new Date("2026-03-01T00:00:00"),
          to: new Date("2026-03-31T23:59:59"),
        },
        "2026-03-11",
      ),
    ).toEqual({ from: "2026-03-01", to: "2026-03-11" })
  })

  test("cuts a span past 366 days", () => {
    const today = new Date("2026-03-10T12:00:00")
    const { from, to } = clampRange(
      { from: new Date("2020-01-01T00:00:00"), to: today },
      today,
    )
    expect(to).toBe("2026-03-10")
    expect(enumerateDays(from, to)).toHaveLength(366)
  })
})

describe("toAnalyticsScope", () => {
  test("omits empty filters and keeps only known values", () => {
    expect(
      toAnalyticsScope({
        channels: [],
        contentTypes: [],
        from: null,
        inboxIds: [],
        to: null,
        topicIds: [],
      }),
    ).toEqual({
      channels: undefined,
      contentTypes: undefined,
      from: undefined,
      inboxIds: undefined,
      to: undefined,
      topicIds: undefined,
    })
    const scope = toAnalyticsScope({
      channels: ["messenger", "bogus"],
      contentTypes: ["photo", "bogus"],
      from: "2026-03-01",
      inboxIds: ["1"],
      to: "2026-03-10",
      topicIds: ["2"],
    })
    expect(scope.channels).toEqual(["messenger"])
    expect(scope.contentTypes).toEqual(["photo"])
    expect(scope.from).toBe("2026-03-01")
    expect(scope.inboxIds).toEqual(["1"])
  })
})

describe("toAnalyticsScope with the dashboard's shared selection", () => {
  test("keeps a channel that cannot post, so the read is empty instead of unfiltered", () => {
    const scope = toAnalyticsScope({
      channels: ["whatsapp"],
      contentTypes: [],
      from: null,
      inboxIds: ["5"],
      to: null,
      topicIds: [],
    })

    expect(scope.channels).toEqual(["whatsapp"])
    expect(scope.inboxIds).toEqual(["5"])
  })
})

describe("series labels", () => {
  const inboxes = [{ channel: "instagram", id: "7", name: "Shop" }]
  const labels = { all: "Total", other: "Other" }

  test("names a series by its group", () => {
    expect(seriesLabel("all", "none", inboxes, labels)).toBe("Total")
    expect(seriesLabel("7", "inbox", inboxes, labels)).toBe("Shop")
    expect(seriesLabel("9", "inbox", inboxes, labels)).toBe("9")
    expect(seriesLabel(OTHER_SERIES_KEY, "channel", inboxes, labels)).toBe(
      "Other",
    )
  })

  test("finds the channel of a series", () => {
    expect(seriesChannel("messenger", "channel", inboxes)).toBe("messenger")
    expect(seriesChannel("7", "inbox", inboxes)).toBe("instagram")
    expect(seriesChannel("all", "none", inboxes)).toBeUndefined()
  })
})

describe("time labels", () => {
  test("names ISO weekdays and hours", () => {
    expect(weekdayName(1, "en", "long")).toBe("Monday")
    expect(weekdayName(7, "en", "short")).toBe("Sun")
    expect(hourName(9, "en")).toBe("9 AM")
    expect(hourName(0, "en")).toBe("12 AM")
  })
})

describe("resolveFilterRange", () => {
  const resolved = {
    range: { from: "2026-05-01", to: "2026-05-30" },
    today: "2026-05-30",
  }

  test("is null until the workspace's day is known", () => {
    expect(
      resolveFilterRange({ from: null, resolved: undefined, to: null }),
    ).toBeNull()
  })

  test("takes the URL days before the server range", () => {
    const range = resolveFilterRange({
      from: "2026-05-10",
      resolved,
      to: "2026-05-12",
    })
    expect(range && toDayKey(range.from)).toBe("2026-05-10")
    expect(range && toDayKey(range.to)).toBe("2026-05-12")
  })

  test("falls back to the server range, never the browser day", () => {
    const range = resolveFilterRange({ from: null, resolved, to: null })
    expect(range && toDayKey(range.from)).toBe("2026-05-01")
    expect(range && toDayKey(range.to)).toBe("2026-05-30")
  })
})
