import { describe, expect, test } from "vitest"
import {
  getDefaultAdsAnalyticsRange,
  parseAnalyticsDateRange,
} from "@/features/ads/schemas/analytics"

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

  test("falls back to the default range for a 40-year span (HIGH-5)", () => {
    const fallback = getDefaultAdsAnalyticsRange()

    const result = parseAnalyticsDateRange({
      from: "1986-08-11",
      to: "2026-08-11",
    })

    expect(result.from).toBe(fallback.from)
    expect(result.to).toBe(fallback.to)
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
