import { describe, expect, test } from "vitest"
import { computeAdsAnalyticsPresetRange } from "@/features/ads/components/date-range-controls"
import { getDefaultAdsAnalyticsRange } from "@/features/ads/schemas/analytics"

const NOW = new Date("2026-08-11T15:30:00.000Z")

describe("computeAdsAnalyticsPresetRange", () => {
  test("1D covers only today (UTC)", () => {
    expect(computeAdsAnalyticsPresetRange("oneDay", NOW)).toEqual({
      from: "2026-08-11",
      to: "2026-08-11",
    })
  })

  test("1W covers today back 6 days (7-day window)", () => {
    expect(computeAdsAnalyticsPresetRange("oneWeek", NOW)).toEqual({
      from: "2026-08-05",
      to: "2026-08-11",
    })
  })

  test("1M covers today back 29 days (30-day window), matching getDefaultAdsAnalyticsRange", () => {
    expect(computeAdsAnalyticsPresetRange("oneMonth", NOW)).toEqual(
      getDefaultAdsAnalyticsRange(NOW),
    )
  })

  test("3M covers today back 89 days (90-day window)", () => {
    expect(computeAdsAnalyticsPresetRange("threeMonths", NOW)).toEqual({
      from: "2026-05-14",
      to: "2026-08-11",
    })
  })

  test("ignores the time-of-day component and always anchors to UTC midnight", () => {
    const earlyMorning = new Date("2026-08-11T00:00:01.000Z")
    const lateNight = new Date("2026-08-11T23:59:59.000Z")

    expect(computeAdsAnalyticsPresetRange("oneDay", earlyMorning)).toEqual(
      computeAdsAnalyticsPresetRange("oneDay", lateNight),
    )
  })
})
