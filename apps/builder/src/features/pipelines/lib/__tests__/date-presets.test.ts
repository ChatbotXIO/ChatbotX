import { describe, expect, test } from "vitest"
import {
  FUTURE_PRESETS,
  PAST_PRESETS,
  resolveDatePreset,
} from "../date-presets"

// Wednesday 2026-03-18 15:30 local time.
const NOW = new Date(2026, 2, 18, 15, 30, 0)
const local = (month: number, day: number, end = false, year = 2026) =>
  end
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0)

describe("resolveDatePreset", () => {
  test.each([
    ["today", local(3, 18), local(3, 18, true)],
    ["yesterday", local(3, 17), local(3, 17, true)],
    ["tomorrow", local(3, 19), local(3, 19, true)],
    ["thisWeek", local(3, 16), local(3, 22, true)],
    ["lastWeek", local(3, 9), local(3, 15, true)],
    ["thisMonth", local(3, 1), local(3, 31, true)],
    ["lastMonth", local(2, 1), local(2, 28, true)],
    ["last7", local(3, 12), local(3, 18, true)],
    ["last14", local(3, 5), local(3, 18, true)],
    ["last30", local(2, 17), local(3, 18, true)],
    ["thisYear", local(1, 1), local(12, 31, true)],
    ["lastYear", local(1, 1, false, 2025), local(12, 31, true, 2025)],
    ["next7", local(3, 18), local(3, 25, true)],
    ["next14", local(3, 18), local(4, 1, true)],
    ["next30", local(3, 18), local(4, 17, true)],
  ] as const)("%s resolves relative to now", (preset, from, to) => {
    expect(resolveDatePreset(preset, NOW)).toEqual({ from, to })
  })

  test("the same preset moves with the clock, so a saved choice stays relative", () => {
    const later = new Date(2026, 2, 25, 9, 0, 0)

    expect(resolveDatePreset("last7", later).from).toEqual(local(3, 19))
  })

  test("is stable across the day, so the board query key does not churn", () => {
    expect(resolveDatePreset("last7", new Date(2026, 2, 18, 0, 1))).toEqual(
      resolveDatePreset("last7", new Date(2026, 2, 18, 23, 59)),
    )
  })

  test("a leap day does not break last month", () => {
    expect(resolveDatePreset("lastMonth", new Date(2028, 2, 10))).toEqual({
      from: new Date(2028, 1, 1),
      to: new Date(2028, 1, 29, 23, 59, 59, 999),
    })
  })

  test("offers every preset exactly once", () => {
    const all = [...FUTURE_PRESETS, ...PAST_PRESETS]

    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(15)
  })
})
