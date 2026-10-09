import { describe, expect, test } from "vitest"
import { resolveRangePreset } from "@/features/integration-google-ads/lib/stats-preset"

const NOW = new Date("2026-10-07T17:30:00Z")
const CREATED_AT = new Date("2026-03-15T00:00:00Z")

const presetOf = (from: string, to: string, tz = "UTC") =>
  resolveRangePreset({
    range: { from, to },
    tz,
    workspaceCreatedAt: CREATED_AT,
    now: NOW,
  })

describe("resolveRangePreset", () => {
  test.each([
    ["today", "2026-10-07", "2026-10-07"],
    ["yesterday", "2026-10-06", "2026-10-06"],
    ["last7", "2026-10-01", "2026-10-07"],
    ["last30", "2026-09-08", "2026-10-07"],
    ["thisMonth", "2026-10-01", "2026-10-31"],
    ["lastMonth", "2026-09-01", "2026-09-30"],
    ["lifeTime", "2026-03-15", "2026-10-07"],
  ])("%s", (preset, from, to) => {
    expect(presetOf(from, to)).toBe(preset)
  })

  test("a range that matches no preset is custom", () => {
    expect(presetOf("2026-10-02", "2026-10-07")).toBe("custom")
  })

  test("today is read in the given zone, not the runtime's", () => {
    // 17:30 UTC is already Oct 8 in Vietnam.
    expect(presetOf("2026-10-08", "2026-10-08", "Asia/Ho_Chi_Minh")).toBe(
      "today",
    )
    expect(presetOf("2026-10-01", "2026-10-07", "Asia/Ho_Chi_Minh")).toBe(
      "custom",
    )
    expect(presetOf("2026-10-02", "2026-10-08", "Asia/Ho_Chi_Minh")).toBe(
      "last7",
    )
  })

  test("month ends handle a December rollover and a leap February", () => {
    const at = (iso: string, from: string, to: string) =>
      resolveRangePreset({
        range: { from, to },
        tz: "UTC",
        workspaceCreatedAt: CREATED_AT,
        now: new Date(iso),
      })

    expect(at("2026-12-10T00:00:00Z", "2026-12-01", "2026-12-31")).toBe(
      "thisMonth",
    )
    expect(at("2027-01-10T00:00:00Z", "2026-12-01", "2026-12-31")).toBe(
      "lastMonth",
    )
    expect(at("2028-03-10T00:00:00Z", "2028-02-01", "2028-02-29")).toBe(
      "lastMonth",
    )
  })

  test("a workspace older than 2020 floors Lifetime at 2020-01-01", () => {
    const preset = resolveRangePreset({
      range: { from: "2020-01-01", to: "2026-10-07" },
      tz: "UTC",
      workspaceCreatedAt: new Date("2018-01-01T00:00:00Z"),
      now: NOW,
    })

    expect(preset).toBe("lifeTime")
  })
})
