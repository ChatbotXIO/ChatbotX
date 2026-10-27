import { describe, expect, test } from "vitest"
import {
  dayKeysFromDates,
  rangeEndingToday,
} from "../src/features/pipelines/lib/analytics-range"

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000 +
  1

describe("rangeEndingToday", () => {
  test("covers exactly N calendar days across a DST change", () => {
    // 2026-03-10 00:30 in New York, two days after the spring-forward change.
    const now = new Date("2026-03-10T04:30:00Z")

    const range = rangeEndingToday(7, "America/New_York", now)

    expect(range).toEqual({ from: "2026-03-04", to: "2026-03-10" })
    expect(daysBetween(range.from, range.to)).toBe(7)
  })

  test("uses the calendar of the given time zone for today", () => {
    // 2026-10-25 20:00 UTC is already 2026-10-26 in Ho Chi Minh City.
    const now = new Date("2026-10-25T20:00:00Z")

    expect(rangeEndingToday(30, "Asia/Ho_Chi_Minh", now)).toEqual({
      from: "2026-09-27",
      to: "2026-10-26",
    })
  })

  test("crosses month and year boundaries", () => {
    const now = new Date("2026-01-02T12:00:00Z")

    expect(rangeEndingToday(90, "UTC", now)).toEqual({
      from: "2025-10-05",
      to: "2026-01-02",
    })
  })
})

describe("dayKeysFromDates", () => {
  test("reads a picked range on the calendar of the given time zone", () => {
    // Start/end of 2026-10-26 in Ho Chi Minh City (UTC+7).
    const range = {
      from: new Date("2026-10-25T17:00:00Z"),
      to: new Date("2026-10-26T16:59:59Z"),
    }

    expect(dayKeysFromDates(range, "Asia/Ho_Chi_Minh")).toEqual({
      from: "2026-10-26",
      to: "2026-10-26",
    })
  })
})
