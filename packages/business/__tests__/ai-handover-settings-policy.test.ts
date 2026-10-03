import type { AiHandoverTimeRange } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  isAiHandoverActive,
  isWithinHourRanges,
} from "../src/ai-handover-settings/policy"

const UTC = "UTC"
const VIETNAM = "Asia/Ho_Chi_Minh" // UTC+7, no DST

const at = (isoUtc: string) => new Date(isoUtc)

describe("isWithinHourRanges", () => {
  const office: AiHandoverTimeRange[] = [{ from: 8, to: 17 }]

  test("is inclusive at the start hour and exclusive at the end hour", () => {
    expect(isWithinHourRanges(office, UTC, at("2026-10-01T08:00:00Z"))).toBe(
      true,
    )
    expect(isWithinHourRanges(office, UTC, at("2026-10-01T16:59:59Z"))).toBe(
      true,
    )
    expect(isWithinHourRanges(office, UTC, at("2026-10-01T17:00:00Z"))).toBe(
      false,
    )
    expect(isWithinHourRanges(office, UTC, at("2026-10-01T07:59:59Z"))).toBe(
      false,
    )
  })

  test("a range wrapping past midnight matches both sides of midnight", () => {
    const night: AiHandoverTimeRange[] = [{ from: 22, to: 6 }]
    expect(isWithinHourRanges(night, UTC, at("2026-10-01T23:30:00Z"))).toBe(
      true,
    )
    expect(isWithinHourRanges(night, UTC, at("2026-10-01T05:59:00Z"))).toBe(
      true,
    )
    expect(isWithinHourRanges(night, UTC, at("2026-10-01T06:00:00Z"))).toBe(
      false,
    )
    expect(isWithinHourRanges(night, UTC, at("2026-10-01T12:00:00Z"))).toBe(
      false,
    )
  })

  test("0..24 is all day", () => {
    const allDay: AiHandoverTimeRange[] = [{ from: 0, to: 24 }]
    expect(isWithinHourRanges(allDay, UTC, at("2026-10-01T00:00:00Z"))).toBe(
      true,
    )
    expect(isWithinHourRanges(allDay, UTC, at("2026-10-01T23:59:59Z"))).toBe(
      true,
    )
  })

  test("a range with equal bounds never matches", () => {
    const empty: AiHandoverTimeRange[] = [
      { from: 0, to: 0 },
      { from: 9, to: 9 },
    ]
    expect(isWithinHourRanges(empty, UTC, at("2026-10-01T00:00:00Z"))).toBe(
      false,
    )
    expect(isWithinHourRanges(empty, UTC, at("2026-10-01T09:30:00Z"))).toBe(
      false,
    )
  })

  test("multiple ranges are OR-ed", () => {
    const split: AiHandoverTimeRange[] = [
      { from: 8, to: 12 },
      { from: 14, to: 18 },
    ]
    expect(isWithinHourRanges(split, UTC, at("2026-10-01T09:00:00Z"))).toBe(
      true,
    )
    expect(isWithinHourRanges(split, UTC, at("2026-10-01T13:00:00Z"))).toBe(
      false,
    )
    expect(isWithinHourRanges(split, UTC, at("2026-10-01T15:00:00Z"))).toBe(
      true,
    )
  })

  test("no ranges never matches", () => {
    expect(isWithinHourRanges([], UTC, at("2026-10-01T09:00:00Z"))).toBe(false)
  })

  test("evaluates the hour in the given timezone, not UTC", () => {
    // 02:00 UTC is 09:00 in Ho Chi Minh City, inside 8..17 there but not in UTC.
    const now = at("2026-10-01T02:00:00Z")
    expect(isWithinHourRanges(office, UTC, now)).toBe(false)
    expect(isWithinHourRanges(office, VIETNAM, now)).toBe(true)
  })

  test("the hour is taken across a UTC date boundary", () => {
    // 18:00 UTC on Sep 30 is 01:00 on Oct 1 in Ho Chi Minh City.
    const night: AiHandoverTimeRange[] = [{ from: 0, to: 2 }]
    expect(isWithinHourRanges(night, VIETNAM, at("2026-09-30T18:00:00Z"))).toBe(
      true,
    )
  })
})

describe("isAiHandoverActive", () => {
  const base = {
    enabled: true,
    scheduleEnabled: false,
    timeRanges: [{ from: 8, to: 17 }] satisfies AiHandoverTimeRange[],
  }
  const noon = at("2026-10-01T12:00:00Z")
  const midnight = at("2026-10-01T00:00:00Z")

  test("a disabled integration is never active, schedule or not", () => {
    expect(isAiHandoverActive({ ...base, enabled: false }, UTC, noon)).toBe(
      false,
    )
    expect(
      isAiHandoverActive(
        { ...base, enabled: false, scheduleEnabled: true },
        UTC,
        noon,
      ),
    ).toBe(false)
  })

  test("enabled without a schedule is always active", () => {
    expect(isAiHandoverActive(base, UTC, midnight)).toBe(true)
  })

  test("enabled with a schedule is active only inside a window", () => {
    const scheduled = { ...base, scheduleEnabled: true }
    expect(isAiHandoverActive(scheduled, UTC, noon)).toBe(true)
    expect(isAiHandoverActive(scheduled, UTC, midnight)).toBe(false)
  })

  test("a schedule with no ranges is never active", () => {
    expect(
      isAiHandoverActive(
        { ...base, scheduleEnabled: true, timeRanges: [] },
        UTC,
        noon,
      ),
    ).toBe(false)
  })
})
