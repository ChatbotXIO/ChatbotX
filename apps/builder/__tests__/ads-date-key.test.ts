// Pin a positive-offset zone so a UTC-projection bug is observable: at
// Asia/Bangkok (UTC+7) local midnight is the *previous* day in UTC, so any
// helper that formats via `toISOString()` shifts the calendar day by one.
process.env.TZ = "Asia/Bangkok"

import { describe, expect, test } from "vitest"
import {
  parseLocalDateKey,
  toLocalDateKey,
} from "@/features/ads/lib/ads-date-key"

describe("toLocalDateKey", () => {
  test("keys the LOCAL calendar day, not the UTC-projected day", () => {
    // Local midnight, 2026-08-11. `.toISOString()` would render 2026-08-10.
    const localMidnight = new Date(2026, 7, 11, 0, 0, 0)

    expect(toLocalDateKey(localMidnight)).toBe("2026-08-11")
    expect(localMidnight.toISOString().slice(0, 10)).toBe("2026-08-10")
  })

  test("zero-pads single-digit months and days", () => {
    expect(toLocalDateKey(new Date(2026, 0, 5))).toBe("2026-01-05")
  })

  test("keys an end-of-day boundary as its own local day", () => {
    // date-fns `endOfDay` produces 23:59:59.999 local — still the same day.
    expect(toLocalDateKey(new Date(2026, 7, 19, 23, 59, 59, 999))).toBe(
      "2026-08-19",
    )
  })
})

describe("parseLocalDateKey", () => {
  test("parses a key to LOCAL midnight of that calendar day", () => {
    const parsed = parseLocalDateKey("2026-08-11")

    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(7)
    expect(parsed.getDate()).toBe(11)
    expect(parsed.getHours()).toBe(0)
  })
})

describe("round-trip", () => {
  test("format → parse → format is stable across a positive UTC offset", () => {
    for (const key of ["2026-01-01", "2026-08-11", "2026-12-31"]) {
      expect(toLocalDateKey(parseLocalDateKey(key))).toBe(key)
    }
  })
})
