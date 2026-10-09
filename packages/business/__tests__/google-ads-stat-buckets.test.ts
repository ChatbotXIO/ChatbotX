import { googleAdsEventStatusValues } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  EVERY_STATUS_IS_BUCKETED,
  GOOGLE_ADS_STAT_BUCKETS,
  toStatBuckets,
} from "../src/google-ads/stat-buckets"
import { googleAdsStatusCountsSchema } from "../src/google-ads/stats-schema"

const counts = {
  pending: 1,
  sending: 2,
  sent: 3,
  processed: 4,
  failed: 5,
  skipped_no_account: 6,
  skipped_expired: 7,
}

describe("toStatBuckets", () => {
  test("groups the raw statuses into the dashboard buckets", () => {
    expect(toStatBuckets(counts)).toEqual({
      confirmed: 4,
      awaitingGoogle: 3,
      queued: 3,
      failed: 5,
      skipped: 13,
    })
  })

  test("every status lands in exactly one bucket", () => {
    const bucketed = Object.values(GOOGLE_ADS_STAT_BUCKETS).flat()

    expect([...bucketed].sort()).toEqual([...googleAdsEventStatusValues].sort())
    expect(new Set(bucketed).size).toBe(bucketed.length)
    // The compile-time twin of the checks above (a new status breaks the build).
    expect(EVERY_STATUS_IS_BUCKETED).toBe(true)
  })

  test("the buckets add up to the total of the counts", () => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0)

    expect(
      Object.values(toStatBuckets(counts)).reduce((a, b) => a + b, 0),
    ).toBe(total)
  })

  test("all zero counts give all zero buckets", () => {
    const zero = Object.fromEntries(
      googleAdsEventStatusValues.map((status) => [status, 0]),
    ) as typeof counts

    expect(Object.values(toStatBuckets(zero))).toEqual([0, 0, 0, 0, 0])
  })
})

describe("googleAdsStatusCountsSchema", () => {
  test("has exactly one key per event status", () => {
    expect(Object.keys(googleAdsStatusCountsSchema.shape).sort()).toEqual(
      [...googleAdsEventStatusValues].sort(),
    )
  })
})
