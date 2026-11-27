import { describe, expect, test } from "vitest"
import { maxBucRegainMs, parseAppUsageHeader } from "../src/meta-usage"
import {
  contentTypesCountedWith,
  dailyCapFor,
  listAutoSpacedSlots,
  PROVIDER_PUBLISH_LIMITS,
  parsePublishingLimit,
  withJitter,
} from "../src/publish-limits"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const AFTER = new Date("2026-01-01T00:00:00Z")

describe("the limits registry", () => {
  test("spacing defaults: Facebook 5, Instagram 10, Threads 5, TikTok 15 minutes", () => {
    expect(
      Object.fromEntries(
        Object.entries(PROVIDER_PUBLISH_LIMITS).map(([k, v]) => [
          k,
          v.minGapMs / MINUTE,
        ]),
      ),
    ).toEqual({ facebook: 5, instagram: 10, threads: 5, tiktok: 15 })
  })

  test("daily caps and their sources", () => {
    expect(dailyCapFor("facebook", "text")).toEqual({
      limit: 25,
      source: "default",
    })
    expect(dailyCapFor("facebook", "reel")).toEqual({
      limit: 30,
      source: "official",
    })
    expect(dailyCapFor("instagram", "image")).toEqual({
      limit: 50,
      source: "official",
    })
    expect(dailyCapFor("threads", "text")).toEqual({
      limit: 250,
      source: "official",
    })
    expect(dailyCapFor("tiktok", "video")).toEqual({
      limit: 15,
      source: "default",
    })
  })

  test("Facebook counts Reels apart from feed posts; the others count everything together", () => {
    expect(contentTypesCountedWith("facebook", "reel")).toEqual(["reel"])
    expect(contentTypesCountedWith("facebook", "image")).not.toContain("reel")
    expect(contentTypesCountedWith("instagram", "image")).toBeNull()
  })

  test("provider job slots: Facebook 3, Instagram 2, Threads 2, TikTok 1", () => {
    expect(
      Object.fromEntries(
        Object.entries(PROVIDER_PUBLISH_LIMITS).map(([k, v]) => [
          k,
          v.maxConcurrentJobs,
        ]),
      ),
    ).toEqual({ facebook: 3, instagram: 2, threads: 2, tiktok: 1 })
  })

  test("jitter stays within 0 to the maximum", () => {
    expect(withJitter(1000, 90_000, () => 0)).toBe(1000)
    expect(withJitter(1000, 90_000, () => 0.999_999)).toBeLessThanOrEqual(
      91_000,
    )
  })
})

describe("parsePublishingLimit", () => {
  test("reads the answer of content_publishing_limit and threads_publishing_limit", () => {
    expect(
      parsePublishingLimit({
        data: [
          {
            config: { quota_duration: 86_400, quota_total: 250 },
            quota_usage: 3,
          },
        ],
      }),
    ).toEqual({ quotaTotal: 250, quotaUsage: 3 })
  })

  test.each([
    {},
    { data: [] },
    { data: [{ quota_usage: 1 }] },
    { data: [{ config: { quota_total: 0 }, quota_usage: 1 }] },
    { data: [{ config: { quota_total: "50" }, quota_usage: 1 }] },
  ])("anything else is null: %j", (body) => {
    expect(parsePublishingLimit(body)).toBeNull()
  })
})

describe("reset hints", () => {
  test("estimated_time_to_regain_access is MINUTES, the longest of every bucket wins", () => {
    expect(
      maxBucRegainMs(
        JSON.stringify({
          "1": [{ estimated_time_to_regain_access: 2 }],
          "2": [
            { estimated_time_to_regain_access: 0 },
            { estimated_time_to_regain_access: 45 },
          ],
        }),
      ),
    ).toBe(45 * MINUTE)
  })

  test("absent, zero or malformed is null", () => {
    expect(maxBucRegainMs(null)).toBeNull()
    expect(maxBucRegainMs("not json")).toBeNull()
    expect(
      maxBucRegainMs(
        JSON.stringify({ "1": [{ estimated_time_to_regain_access: 0 }] }),
      ),
    ).toBeNull()
  })

  test("X-App-Usage reads the peak percentage", () => {
    expect(
      parseAppUsageHeader(
        JSON.stringify({ call_count: 12, total_cputime: 80, total_time: 3 }),
      ),
    ).toBe(80)
    expect(parseAppUsageHeader(null)).toBeNull()
  })
})

describe("listAutoSpacedSlots (a destination with no posting schedule)", () => {
  const base = { after: AFTER, capLimit: 50, gapMs: 10 * MINUTE }

  test("a burst gets distinct slots, each at least the gap apart", () => {
    const slots = listAutoSpacedSlots({ ...base, count: 5, taken: [] })
    expect(slots).toHaveLength(5)
    for (const [index, slot] of slots.entries()) {
      expect(slot.getTime()).toBeGreaterThan(AFTER.getTime())
      if (index > 0) {
        expect(
          slot.getTime() - (slots[index - 1] as Date).getTime(),
        ).toBeGreaterThanOrEqual(10 * MINUTE)
      }
    }
  })

  test("it keeps the gap from queued slots and recent publishes", () => {
    const taken = [new Date(AFTER.getTime() + 3 * MINUTE)]
    const [first] = listAutoSpacedSlots({ ...base, count: 1, taken })
    expect((first as Date).getTime()).toBe(taken[0].getTime() + 10 * MINUTE)
  })

  test("it stays under the rolling 24 hour cap", () => {
    // Three already in the last hours, cap 3: the next one waits for the oldest to leave.
    const taken = [1, 2, 3].map((n) => new Date(AFTER.getTime() - n * HOUR))
    const [first] = listAutoSpacedSlots({
      after: AFTER,
      capLimit: 3,
      count: 1,
      gapMs: 10 * MINUTE,
      taken,
    })
    expect((first as Date).getTime()).toBe(taken[2].getTime() + 24 * HOUR)
  })

  test("a count of zero or an impossible cap never loops for ever", () => {
    expect(listAutoSpacedSlots({ ...base, count: 0, taken: [] })).toEqual([])
    expect(
      listAutoSpacedSlots({
        after: AFTER,
        capLimit: 0,
        count: 1,
        gapMs: MINUTE,
        taken: [],
      }),
    ).toEqual([])
  })
})
