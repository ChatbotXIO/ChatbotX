import { describe, expect, test } from "vitest"
import {
  isRangeWithinLimit,
  statisticsPresetRange,
  todayInTimeZone,
} from "@/features/facebook-marketing-messages/lib/statistics-range"

const now = new Date("2026-10-20T20:00:00Z")

describe("todayInTimeZone", () => {
  test("uses the ad account's calendar day, not UTC's", () => {
    expect(todayInTimeZone("Asia/Ho_Chi_Minh", now)).toBe("2026-10-21")
    expect(todayInTimeZone("America/Los_Angeles", now)).toBe("2026-10-20")
  })
})

describe("statisticsPresetRange", () => {
  test("last30 ends today and spans 30 days inclusive", () => {
    expect(statisticsPresetRange("last30", "America/Los_Angeles", now)).toEqual(
      { since: "2026-09-21", until: "2026-10-20" },
    )
  })

  test("thisMonth and lastMonth", () => {
    expect(
      statisticsPresetRange("thisMonth", "America/Los_Angeles", now),
    ).toEqual({ since: "2026-10-01", until: "2026-10-20" })
    expect(
      statisticsPresetRange("lastMonth", "America/Los_Angeles", now),
    ).toEqual({ since: "2026-09-01", until: "2026-09-30" })
  })

  test("last7 across a month boundary", () => {
    expect(
      statisticsPresetRange("last7", "UTC", new Date("2026-03-03T12:00:00Z")),
    ).toEqual({ since: "2026-02-25", until: "2026-03-03" })
  })

  test("lastMonth in January rolls back the year", () => {
    expect(
      statisticsPresetRange(
        "lastMonth",
        "UTC",
        new Date("2026-01-15T12:00:00Z"),
      ),
    ).toEqual({ since: "2025-12-01", until: "2025-12-31" })
  })
})

describe("isRangeWithinLimit", () => {
  test("accepts since <= until within 37 months", () => {
    expect(isRangeWithinLimit("2026-10-20", "2026-10-20")).toBe(true)
    expect(isRangeWithinLimit("2023-09-20", "2026-10-20")).toBe(true)
  })

  test("rejects since after until and spans over 37 months", () => {
    expect(isRangeWithinLimit("2026-10-21", "2026-10-20")).toBe(false)
    expect(isRangeWithinLimit("2023-09-19", "2026-10-20")).toBe(false)
  })
})
