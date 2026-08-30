import { describe, expect, test } from "vitest"
import {
  getDefaultAdsAnalyticsRange,
  parseAnalyticsDateRange,
  resolveTimezone,
} from "@/features/ads/schema/analytics"

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

  test("clamps a 367-inclusive-day span (one past the cap) — key-diff off-by-one guard", () => {
    // 2025-08-10 → 2026-08-11 is a key-diff of 366, i.e. 367 INCLUSIVE days —
    // exactly one over the cap. An instant- or diff-based check lets it slip.
    const result = parseAnalyticsDateRange({
      from: "2025-08-10",
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

  test("falls back for calendar-invalid keys that pass the shape regex", () => {
    const fallback = getDefaultAdsAnalyticsRange()

    // Out-of-range month/day are the right shape but not real days. Each must
    // fall back to a valid key rather than reach the clamp branch as an Invalid
    // Date (which threw before) or be returned silently normalized.
    for (const bad of ["2026-13-01", "2026-02-30", "2026-00-10"]) {
      expect(
        parseAnalyticsDateRange({ from: bad, to: "2026-08-27" }).from,
      ).toBe(fallback.from)

      // `to` invalid + an ancient valid `from` routes through the clamp branch;
      // it must NOT throw and must carry the fallback `to`.
      const asTo = parseAnalyticsDateRange({ from: "2020-01-01", to: bad })
      expect(asTo.to).toBe(fallback.to)
      expect(Number.isNaN(asTo.since.getTime())).toBe(false)
      expect(Number.isNaN(asTo.until.getTime())).toBe(false)
    }
  })

  test("defaults to UTC anchoring when `tz` is omitted (backward compat)", () => {
    const result = parseAnalyticsDateRange({
      from: "2026-07-13",
      to: "2026-08-11",
    })

    expect(result.timezone).toBe("UTC")
    expect(result.since.toISOString()).toBe("2026-07-13T00:00:00.000Z")
    expect(result.until.toISOString()).toBe("2026-08-11T23:59:59.999Z")
  })

  test("converts local day boundaries to exact UTC instants for a non-UTC viewer timezone", () => {
    const result = parseAnalyticsDateRange({
      from: "2026-08-27",
      to: "2026-08-27",
      tz: "Asia/Saigon",
    })

    expect(result.timezone).toBe("Asia/Saigon")
    expect(result.since.toISOString()).toBe("2026-08-26T17:00:00.000Z")
    expect(result.until.toISOString()).toBe("2026-08-27T16:59:59.999Z")
  })

  test("falls back to UTC for an invalid `tz` (old byte-identical behavior)", () => {
    const invalidTz = parseAnalyticsDateRange({
      from: "2026-07-13",
      to: "2026-08-11",
      tz: "not-a-tz",
    })
    expect(invalidTz.timezone).toBe("UTC")
    expect(invalidTz.since.toISOString()).toBe("2026-07-13T00:00:00.000Z")

    const tooLongTz = parseAnalyticsDateRange({
      from: "2026-07-13",
      to: "2026-08-11",
      tz: "A".repeat(65),
    })
    expect(tooLongTz.timezone).toBe("UTC")
    expect(tooLongTz.since.toISOString()).toBe("2026-07-13T00:00:00.000Z")
  })

  test("the over-cap clamp branch anchors the clamped window to the viewer timezone", () => {
    const result = parseAnalyticsDateRange({
      from: "1986-08-11",
      to: "2026-08-27",
      tz: "Asia/Saigon",
    })

    expect(result.from).toBe("2025-08-27")
    expect(result.to).toBe("2026-08-27")
    expect(result.timezone).toBe("Asia/Saigon")
    // The clamped `since` is local midnight of `result.from` in Asia/Saigon
    // (UTC+7), not UTC midnight.
    expect(result.since.toISOString()).toBe("2025-08-26T17:00:00.000Z")
    const spanDays =
      (result.until.getTime() - result.since.getTime()) / (24 * 60 * 60 * 1000)
    expect(spanDays).toBeLessThanOrEqual(366)
  })
})

describe("resolveTimezone", () => {
  test("passes through a valid IANA timezone name", () => {
    expect(resolveTimezone("Asia/Saigon")).toBe("Asia/Saigon")
    expect(resolveTimezone("America/New_York")).toBe("America/New_York")
    expect(resolveTimezone("UTC")).toBe("UTC")
  })

  test("falls back to UTC for garbage input", () => {
    expect(resolveTimezone("not-a-tz")).toBe("UTC")
    expect(resolveTimezone("")).toBe("UTC")
    expect(resolveTimezone("A".repeat(65))).toBe("UTC")
  })
})
