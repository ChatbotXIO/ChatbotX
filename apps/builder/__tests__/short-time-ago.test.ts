import { describe, expect, test } from "vitest"
import { shortTimeAgo } from "@/features/conversations/lib/short-time-ago"

const NOW = new Date("2026-10-09T12:00:00Z").getTime()
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW - ms)

describe("shortTimeAgo", () => {
  // The list ticks once a minute, so anything younger than that is "now":
  // a seconds figure would sit frozen until the next tick anyway.
  test.each([
    ["7 seconds", ago(7 * SECOND), { unit: "now", count: 0 }],
    ["59 seconds", ago(59 * SECOND), { unit: "now", count: 0 }],
    ["1 minute", ago(MINUTE), { unit: "minute", count: 1 }],
    [
      "29 minutes 30 seconds",
      ago(29 * MINUTE + 30 * SECOND),
      { unit: "minute", count: 29 },
    ],
    [
      "59 minutes",
      ago(59 * MINUTE + 59 * SECOND),
      { unit: "minute", count: 59 },
    ],
    ["1 hour", ago(HOUR), { unit: "hour", count: 1 }],
    ["23 hours", ago(23 * HOUR + 59 * MINUTE), { unit: "hour", count: 23 }],
    ["1 day", ago(DAY), { unit: "day", count: 1 }],
    ["8 days", ago(8 * DAY), { unit: "day", count: 8 }],
    ["29 days", ago(29 * DAY + 23 * HOUR), { unit: "day", count: 29 }],
    ["30 days", ago(30 * DAY), { unit: "month", count: 1 }],
    ["90 days", ago(90 * DAY), { unit: "month", count: 3 }],
    [
      "364 days stays under a year",
      ago(364 * DAY),
      { unit: "month", count: 11 },
    ],
    ["365 days", ago(365 * DAY), { unit: "year", count: 1 }],
    ["3 years", ago(3 * 365 * DAY + 100 * DAY), { unit: "year", count: 3 }],
  ])("%s → %o", (_, at, expected) => {
    expect(shortTimeAgo(at, NOW)).toEqual(expected)
  })

  test("accepts an ISO string", () => {
    expect(shortTimeAgo(ago(8 * DAY).toISOString(), NOW)).toEqual({
      unit: "day",
      count: 8,
    })
  })

  // Server and browser clocks drift; a timestamp a few seconds in the
  // future must not render as a negative age.
  test("treats a future timestamp as now", () => {
    expect(shortTimeAgo(new Date(NOW + 5 * SECOND), NOW)).toEqual({
      unit: "now",
      count: 0,
    })
  })
})
