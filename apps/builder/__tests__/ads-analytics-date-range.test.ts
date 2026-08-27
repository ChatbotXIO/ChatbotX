import { describe, expect, test } from "vitest"
import {
  getDefaultAdsAnalyticsRange,
  parseAnalyticsDateRange,
} from "@/features/ads/schemas/analytics"

describe("getDefaultAdsAnalyticsRange", () => {
  test("returns a 7-day window (today back 6 days, UTC) matching the Last 7 days preset default", () => {
    const now = new Date("2026-08-11T15:30:00.000Z")

    expect(getDefaultAdsAnalyticsRange(now)).toEqual({
      from: "2026-08-05",
      to: "2026-08-11",
    })
  })

  test("anchors to UTC midnight, ignoring the time-of-day component", () => {
    const earlyMorning = new Date("2026-08-11T00:00:01.000Z")
    const lateNight = new Date("2026-08-11T23:59:59.000Z")

    expect(getDefaultAdsAnalyticsRange(earlyMorning)).toEqual(
      getDefaultAdsAnalyticsRange(lateNight),
    )
  })
})

describe("parseAnalyticsDateRange", () => {
  test("keeps a normal 30-day range unchanged", () => {
    const result = parseAnalyticsDateRange({
      from: "2026-07-13",
      to: "2026-08-11",
    })

    expect(result.from).toBe("2026-07-13")
    expect(result.to).toBe("2026-08-11")
  })

  test("preserves a 366-day span (a full leap year)", () => {
    const result = parseAnalyticsDateRange({
      from: "2025-08-11",
      to: "2026-08-11",
    })

    expect(result.from).toBe("2025-08-11")
    expect(result.to).toBe("2026-08-11")
  })

  test("clamps an over-cap span to the last 366 days ending at `to` (HIGH-5)", () => {
    // A 40-year span (or the "Lifetime" preset on an old workspace) must stay
    // bounded by the scan guard, but the user should see the most recent year
    // under their chosen label — not a silent collapse to the 7-day default.
    const result = parseAnalyticsDateRange({
      from: "1986-08-11",
      to: "2026-08-11",
    })

    expect(result.from).toBe("2025-08-11")
    expect(result.to).toBe("2026-08-11")
    // The clamped window is exactly at the cap boundary (still accepted).
    const spanDays =
      (result.until.getTime() - result.since.getTime()) / (24 * 60 * 60 * 1000)
    expect(spanDays).toBeLessThanOrEqual(366)
  })

  test("falls back to the default range when since > until (existing behavior, unchanged)", () => {
    const fallback = getDefaultAdsAnalyticsRange()

    const result = parseAnalyticsDateRange({
      from: "2026-08-11",
      to: "2026-08-01",
    })

    expect(result.from).toBe(fallback.from)
    expect(result.to).toBe(fallback.to)
  })

  test("falls back to the default range for malformed date keys", () => {
    const fallback = getDefaultAdsAnalyticsRange()

    const result = parseAnalyticsDateRange({
      from: "not-a-date",
      to: "also-not-a-date",
    })

    expect(result.from).toBe(fallback.from)
    expect(result.to).toBe(fallback.to)
  })
})
