import { describe, expect, test } from "vitest"
import { formatCallDurationSeconds } from "../src/features/messages/lib/format-call-duration"

describe("formatCallDurationSeconds", () => {
  test("formats whole minutes and seconds as m:ss", () => {
    expect(formatCallDurationSeconds(65)).toBe("1:05")
  })

  test("pads a single-digit seconds remainder", () => {
    expect(formatCallDurationSeconds(5)).toBe("0:05")
  })

  test("formats zero seconds as 0:00", () => {
    expect(formatCallDurationSeconds(0)).toBe("0:00")
  })

  test("floors a fractional seconds value", () => {
    expect(formatCallDurationSeconds(90.9)).toBe("1:30")
  })

  test("formats minutes past 9 without truncating the minute component", () => {
    expect(formatCallDurationSeconds(725)).toBe("12:05")
  })

  test("returns 0:00 for a negative value instead of a negative label", () => {
    expect(formatCallDurationSeconds(-5)).toBe("0:00")
  })

  test("returns 0:00 for a non-finite value", () => {
    expect(formatCallDurationSeconds(Number.NaN)).toBe("0:00")
    expect(formatCallDurationSeconds(Number.POSITIVE_INFINITY)).toBe("0:00")
  })
})
