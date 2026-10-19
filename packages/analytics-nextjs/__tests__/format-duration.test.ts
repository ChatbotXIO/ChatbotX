// @vitest-environment node
import { describe, expect, test } from "vitest"
import { formatDuration, secondsToMinutes } from "../src/utils/format-duration"

describe("formatDuration", () => {
  test.each([
    [0, "0s"],
    [45, "45s"],
    [59.6, "1m"],
    [60, "1m"],
    [330, "5m 30s"],
    [3599, "59m 59s"],
    [3600, "1h"],
    [7500, "2h 5m"],
    [86_399, "23h 59m"],
    [86_400, "1d"],
    [97_200, "1d 3h"],
  ])("formats %s seconds in en as %s", (seconds, expected) => {
    expect(formatDuration(seconds, "en")).toBe(expected)
  })

  test("treats negative and non-finite input as zero", () => {
    expect(formatDuration(-5, "en")).toBe("0s")
    expect(formatDuration(Number.NaN, "en")).toBe("0s")
  })

  test("uses locale-specific unit strings from Intl", () => {
    const expected = `${new Intl.NumberFormat("ja", {
      style: "unit",
      unit: "minute",
      unitDisplay: "narrow",
    }).format(5)}${" "}${new Intl.NumberFormat("ja", {
      style: "unit",
      unit: "second",
      unitDisplay: "narrow",
    }).format(30)}`
    expect(formatDuration(330, "ja")).toBe(expected)
  })
})

describe("secondsToMinutes", () => {
  test("rounds to one decimal", () => {
    expect(secondsToMinutes(90)).toBe(1.5)
    expect(secondsToMinutes(100)).toBe(1.7)
    expect(secondsToMinutes(0)).toBe(0)
  })
})
