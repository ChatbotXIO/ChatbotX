import { describe, expect, test } from "vitest"
import {
  BEST_TIMES_MIN_PER_SLOT,
  BEST_TIMES_MIN_TOTAL,
  type BestTimesPost,
  computeBestTimes,
  median,
} from "../src/post-best-times"

// 2026-11-02 is a Monday. 02:00Z is 09:00 in Asia/Ho_Chi_Minh (UTC+7) and
// 21:00 the previous Sunday in America/New_York (UTC-5 in November).
const MONDAY_0200Z = Date.UTC(2026, 10, 2, 2, 0, 0)
const DAY_MS = 86_400_000

const post = (
  daysAfter: number,
  hourOffset: number,
  engagement: number,
  inboxId = "1",
): BestTimesPost => ({
  engagement,
  inboxId,
  publishedAt: new Date(
    MONDAY_0200Z + daysAfter * DAY_MS + hourOffset * 3_600_000,
  ),
})

describe("median", () => {
  test("handles empty, odd and even lists", () => {
    expect(median([])).toBe(0)
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
})

describe("computeBestTimes", () => {
  test("reports insufficient data below the overall minimum and ranks nothing", () => {
    const posts = Array.from({ length: BEST_TIMES_MIN_TOTAL - 1 }, (_, i) =>
      post(i * 7, 0, 10),
    )
    const result = computeBestTimes({ posts, timezone: "UTC" })
    expect(result.status).toBe("insufficientData")
    expect(result.top).toEqual([])
    expect(result.totalPosts).toBe(BEST_TIMES_MIN_TOTAL - 1)
    expect(result.slots.length).toBeGreaterThan(0)
  })

  test("ranks a slot only once it has the per-slot minimum of posts", () => {
    // 6 Monday-09:00 posts with 100 engagement, 2 Tuesday-09:00 posts with 1000,
    // padding at other slots so the whole sample passes the overall minimum.
    const strong = Array.from({ length: 6 }, (_, i) => post(i * 7, 0, 100))
    const thin = [post(1, 0, 1000), post(8, 0, 1000)]
    const padding = Array.from({ length: 14 }, (_, i) => post(i * 7 + 2, 5, 10))
    const result = computeBestTimes({
      posts: [...strong, ...thin, ...padding],
      timezone: "UTC",
    })
    expect(result.status).toBe("ok")
    expect(result.top[0]).toMatchObject({ hour: 2, weekday: 1 })
    expect(
      result.top.some((slot) => slot.weekday === 2 && slot.hour === 2),
    ).toBe(false)
    expect(
      result.top.every((slot) => slot.sampleSize >= BEST_TIMES_MIN_PER_SLOT),
    ).toBe(true)
    // The thin slot is still visible in the heatmap.
    expect(
      result.slots.find((slot) => slot.weekday === 2 && slot.hour === 2)
        ?.sampleSize,
    ).toBe(2)
  })

  test("reads weekday and hour in the requested time zone", () => {
    const posts = Array.from({ length: 21 }, (_, i) => post(i * 7, 0, 10))
    const hanoi = computeBestTimes({ posts, timezone: "Asia/Ho_Chi_Minh" })
    expect(hanoi.slots).toEqual([
      expect.objectContaining({ hour: 9, sampleSize: 21, weekday: 1 }),
    ])
    const newYork = computeBestTimes({ posts, timezone: "America/New_York" })
    // Weeks across the DST change (2026-11-01) still land on one local slot
    // per side of it; the first Monday is Sunday 21:00 local.
    expect(newYork.slots.some((slot) => slot.weekday === 7)).toBe(true)
  })

  test("compares each post with the median of its own inbox", () => {
    // A big inbox (median 1000) and a small one (median 10): a 1000 on the
    // small inbox beats a 1000 on the big one.
    const big = Array.from({ length: 12 }, (_, i) =>
      post(i * 7, i % 2 === 0 ? 0 : 5, 1000, "big"),
    )
    const small = Array.from({ length: 12 }, (_, i) =>
      post(i * 7, i % 2 === 0 ? 0 : 5, i === 0 ? 1000 : 10, "small"),
    )
    const result = computeBestTimes({
      posts: [...big, ...small],
      timezone: "UTC",
    })
    const slot = result.slots.find((s) => s.hour === 2 && s.weekday === 1)
    expect(slot?.sampleSize).toBeGreaterThanOrEqual(BEST_TIMES_MIN_PER_SLOT)
    expect(slot?.score).toBeGreaterThan(0)
  })

  test("never divides by a zero inbox median", () => {
    const posts = Array.from({ length: 20 }, (_, i) =>
      post(i * 7, 0, i === 0 ? 5 : 0),
    )
    const result = computeBestTimes({ posts, timezone: "UTC" })
    expect(Number.isFinite(result.slots[0]?.score)).toBe(true)
  })

  test("breaks ties by sample size, then weekday and hour", () => {
    const a = Array.from({ length: 10 }, (_, i) => post(i * 7, 0, 10))
    const b = Array.from({ length: 12 }, (_, i) => post(i * 7 + 1, 0, 10))
    const result = computeBestTimes({ posts: [...a, ...b], timezone: "UTC" })
    expect(result.top.map((slot) => slot.weekday)).toEqual([2, 1])
  })
})
