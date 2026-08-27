import { describe, expect, test } from "vitest"
import {
  parseLocalDateKey,
  toLocalDateKey,
} from "@/features/ads/lib/ads-date-key"

// These tests are deliberately TIMEZONE-AGNOSTIC: they must pass on a UTC CI
// runner AND on a developer machine in any offset. Mutating `process.env.TZ`
// inside a test file is unreliable (V8 caches the zone per isolate; Windows
// ignores it entirely) and leaks into sibling tests in the same worker — so
// expectations are derived from the runtime offset instead of pinning one.

describe("toLocalDateKey", () => {
  test("keys the LOCAL calendar day, not the UTC-projected day", () => {
    // Local midnight, 2026-08-11 — in any timezone, the LOCAL key must be the
    // components the Date was constructed with.
    const localMidnight = new Date(2026, 7, 11, 0, 0, 0)

    expect(toLocalDateKey(localMidnight)).toBe("2026-08-11")

    // The UTC projection (`toISOString`) shifts the day back by one exactly
    // when the runner is AHEAD of UTC (negative getTimezoneOffset) — the bug
    // class this helper exists to avoid. At/behind UTC the projection stays
    // on the same calendar day.
    const utcKey = localMidnight.toISOString().slice(0, 10)
    expect(utcKey).toBe(
      localMidnight.getTimezoneOffset() < 0 ? "2026-08-10" : "2026-08-11",
    )
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
  test("format → parse → format is stable in any runner timezone", () => {
    for (const key of ["2026-01-01", "2026-08-11", "2026-12-31"]) {
      expect(toLocalDateKey(parseLocalDateKey(key))).toBe(key)
    }
  })
})
