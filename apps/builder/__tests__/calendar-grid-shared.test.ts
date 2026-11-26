import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import {
  groupByDay,
  sortByDate,
  zonedDayKey,
} from "@/components/calendar/calendar-grid"

// 2026-09-02T18:30Z is already 03 Sep in Ho Chi Minh (UTC+7), still 02 Sep in UTC and 02 Sep in Los Angeles.
const INSTANT = new Date("2026-09-02T18:30:00Z")

describe("zonedDayKey", () => {
  test("reads the calendar day in the given zone", () => {
    expect(zonedDayKey(INSTANT, "Asia/Ho_Chi_Minh")).toBe("2026-09-03")
    expect(zonedDayKey(INSTANT, "UTC")).toBe("2026-09-02")
    expect(zonedDayKey(INSTANT, "America/Los_Angeles")).toBe("2026-09-02")
  })

  test("falls back to UTC for an unusable zone", () => {
    expect(zonedDayKey(INSTANT, "Not/AZone")).toBe("2026-09-02")
  })
})

describe("groupByDay (shared)", () => {
  const rows = [
    { at: new Date("2026-09-02T16:59:59Z"), id: "before" },
    { at: new Date("2026-09-02T17:00:00Z"), id: "after" },
  ]

  test("splits at midnight of the display zone, not the process zone", () => {
    const grouped = groupByDay(rows, (row) => row.at, "Asia/Ho_Chi_Minh")
    expect(grouped.get("2026-09-02")?.map((r) => r.id)).toEqual(["before"])
    expect(grouped.get("2026-09-03")?.map((r) => r.id)).toEqual(["after"])
  })

  test("the same rows fall on one day in UTC", () => {
    const grouped = groupByDay(rows, (row) => row.at, "UTC")
    expect(grouped.get("2026-09-02")?.map((r) => r.id)).toEqual([
      "before",
      "after",
    ])
  })
})

describe("sortByDate", () => {
  test("sorts ascending without mutating the input", () => {
    const rows = [
      { at: new Date("2026-09-03T00:00:00Z"), id: "b" },
      { at: new Date("2026-09-01T00:00:00Z"), id: "a" },
    ]
    expect(sortByDate(rows, (row) => row.at).map((r) => r.id)).toEqual([
      "a",
      "b",
    ])
    expect(rows[0].id).toBe("b")
  })
})

const GRID_MODULE = resolve(
  process.cwd(),
  "src/components/calendar/calendar-grid.ts",
)

/** Runs the grid helpers in a fresh process whose zone is `zone` (a worker cannot switch zones). */
const weekTitleIn = (zone: string) => {
  const script = `
    const grid = await import(${JSON.stringify(GRID_MODULE)})
    const anchor = grid.parseDateParam("2026-09-02")
    const { from, to } = grid.calendarRangeConfig.week.getVisibleInterval(anchor, anchor)
    const print = (day) => new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" }).format(day)
    console.log(JSON.stringify({
      anchor: grid.toUtcDay(anchor).toISOString(),
      offset: new Date(2026, 8, 2).getTimezoneOffset(),
      title: grid.formatUtcDayRange(from, to, print),
    }))
  `
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { encoding: "utf8", env: { ...process.env, TZ: zone } },
  )
  return JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}") as {
    anchor: string
    offset: number
    title: string
  }
}

describe("toUtcDay and formatUtcDayRange under different process zones", () => {
  test.each([
    ["America/Los_Angeles", 420],
    ["Pacific/Kiritimati", -840],
    ["UTC", 0],
  ])("a week title reads the same Monday to Sunday in %s", (zone, offset) => {
    const result = weekTitleIn(zone)

    // Guard: the child really ran in that zone, or this test proves nothing.
    expect(result.offset).toBe(offset)
    expect(result.anchor).toBe("2026-09-02T00:00:00.000Z")
    expect(result.title).toBe("Aug 31, 2026 \u2013 Sep 6, 2026")
  })
})
