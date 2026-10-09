import { timezoneCandidates } from "@chatbotx.io/utils/timezone"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  enumerateDateKeys,
  getDefaultAdsAnalyticsRange,
  parseAnalyticsDateRange,
  resolveTimezone,
} from "../src/ads-analytics/date-range"

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

  test("canonicalises the case so PostgreSQL's exact-text match agrees", () => {
    expect(resolveTimezone("america/new_york")).toBe("America/New_York")
    expect(resolveTimezone("AMERICA/NEW_YORK")).toBe("America/New_York")
    expect(resolveTimezone("America/new_York")).toBe("America/New_York")
    expect(resolveTimezone("utc")).toBe("UTC")
    // A known alias pair keeps the caller's spelling, correctly cased.
    expect(resolveTimezone("asia/ho_chi_minh")).toBe("Asia/Ho_Chi_Minh")
    expect(resolveTimezone("Asia/Ho_Chi_Minh")).toBe("Asia/Ho_Chi_Minh")
    expect(resolveTimezone("ASIA/SAIGON")).toBe("Asia/Saigon")
    expect(resolveTimezone("asia/calcutta")).toBe("Asia/Calcutta")
    expect(resolveTimezone("europe/kiev")).toBe("Europe/Kiev")
  })

  test.each([
    "Asia/Saigon",
    "Asia/Ho_Chi_Minh",
    "Asia/Calcutta",
    "Asia/Kolkata",
    "Europe/Kiev",
    "Europe/Kyiv",
    "UTC",
    "Etc/UTC",
    "GMT",
  ])("%s resolves to a name the SQL candidate list can match", (name) => {
    const resolved = resolveTimezone(name)
    const sqlNames = [name, ...timezoneCandidates(name)]

    // Same zone, whichever spelling ICU prefers; "UTC" aliases land on UTC.
    expect(
      sqlNames.includes(resolved) ||
        timezoneCandidates(resolved).some((c) => sqlNames.includes(c)) ||
        resolved === "UTC",
    ).toBe(true)
    expect(resolved.length).toBeGreaterThan(0)
  })

  test("rejects offset zones that PostgreSQL cannot resolve", () => {
    expect(resolveTimezone("+07:00")).toBe("UTC")
    expect(resolveTimezone("-05:00")).toBe("UTC")
    expect(
      parseAnalyticsDateRange({
        from: "2026-10-01",
        to: "2026-10-01",
        tz: "+07:00",
      }),
    ).toMatchObject({
      timezone: "UTC",
      since: new Date("2026-10-01T00:00:00.000Z"),
    })
  })
})

describe("getDefaultAdsAnalyticsRange with a timezone", () => {
  // 2026-08-11T17:00:01Z is already 2026-08-12 00:00:01 in UTC+7.
  const justAfterLocalMidnight = new Date("2026-08-11T17:00:01.000Z")

  test("uses the local day in the zone just after local midnight", () => {
    expect(
      getDefaultAdsAnalyticsRange(justAfterLocalMidnight, "Asia/Ho_Chi_Minh"),
    ).toEqual({ from: "2026-08-06", to: "2026-08-12" })
  })

  test("an empty or omitted tz still means UTC", () => {
    const utc = { from: "2026-08-05", to: "2026-08-11" }

    expect(getDefaultAdsAnalyticsRange(justAfterLocalMidnight)).toEqual(utc)
    expect(getDefaultAdsAnalyticsRange(justAfterLocalMidnight, "")).toEqual(utc)
    expect(getDefaultAdsAnalyticsRange(justAfterLocalMidnight, "UTC")).toEqual(
      utc,
    )
  })

  test("a zone behind UTC is still on the previous local day", () => {
    expect(
      getDefaultAdsAnalyticsRange(
        new Date("2026-08-11T03:00:00.000Z"),
        "America/New_York",
      ),
    ).toEqual({ from: "2026-08-04", to: "2026-08-10" })
  })

  test("the window ends on the local day across a DST change", () => {
    // US spring forward: 2026-03-08. 08:30Z is 03:30 EDT on the 8th.
    expect(
      getDefaultAdsAnalyticsRange(
        new Date("2026-03-08T08:30:00.000Z"),
        "America/New_York",
      ),
    ).toEqual({ from: "2026-03-02", to: "2026-03-08" })
  })
})

describe("parseAnalyticsDateRange default range uses the resolved zone", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("a Meta-style call with a tz and an invalid from falls back to the local today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-11T17:00:01.000Z"))

    const result = parseAnalyticsDateRange({
      from: "not-a-date",
      to: "2026-08-12",
      tz: "Asia/Ho_Chi_Minh",
    })

    expect(result.from).toBe("2026-08-06")
    expect(result.to).toBe("2026-08-12")
    expect(result.timezone).toBe("Asia/Ho_Chi_Minh")
  })

  test("empty endpoints and tz resolve to the UTC default", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-11T17:00:01.000Z"))

    const result = parseAnalyticsDateRange({ from: "", to: "", tz: "" })

    expect(result).toMatchObject({
      from: "2026-08-05",
      to: "2026-08-11",
      timezone: "UTC",
    })
  })

  test("an unknown tz falls back to the UTC today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-11T17:00:01.000Z"))

    expect(
      parseAnalyticsDateRange({ from: "", to: "", tz: "Mars/Olympus" }),
    ).toMatchObject({ to: "2026-08-11", timezone: "UTC" })
  })

  test("an invalid to alone keeps a valid from and takes the local today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-11T17:00:01.000Z"))

    const result = parseAnalyticsDateRange({
      from: "2026-08-10",
      to: "2026-13-40",
      tz: "Asia/Ho_Chi_Minh",
    })

    expect(result.from).toBe("2026-08-10")
    expect(result.to).toBe("2026-08-12")
  })

  test("an invalid from alone keeps a valid to", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-11T17:00:01.000Z"))

    const result = parseAnalyticsDateRange({
      from: "2026-02-30",
      to: "2026-08-10",
      tz: "Asia/Ho_Chi_Minh",
    })

    expect(result.from).toBe("2026-08-06")
    expect(result.to).toBe("2026-08-10")
  })

  test("the day boundaries across a DST change are local midnight and 23:59:59.999", () => {
    const result = parseAnalyticsDateRange({
      from: "2026-03-08",
      to: "2026-03-08",
      tz: "America/New_York",
    })

    // The 8th is a 23-hour day: EST midnight to EDT 23:59:59.999.
    expect(result.since.toISOString()).toBe("2026-03-08T05:00:00.000Z")
    expect(result.until.toISOString()).toBe("2026-03-09T03:59:59.999Z")
  })
})

describe("enumerateDateKeys", () => {
  test("lists every day inclusively", () => {
    expect(enumerateDateKeys("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ])
  })

  test("a single day yields one key and an inverted range none", () => {
    expect(enumerateDateKeys("2026-08-11", "2026-08-11")).toEqual([
      "2026-08-11",
    ])
    expect(enumerateDateKeys("2026-08-12", "2026-08-11")).toEqual([])
  })

  test("crosses a leap day", () => {
    expect(enumerateDateKeys("2028-02-28", "2028-03-01")).toHaveLength(3)
  })
})
