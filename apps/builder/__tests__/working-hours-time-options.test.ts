// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  END_MINUTE_OPTIONS,
  END_SELECT_ITEMS,
  formatMinute,
  START_MINUTE_OPTIONS,
} from "../src/features/working-hours/lib/time-options"

describe("working-hours time options", () => {
  test("start options run 00:00 to 23:45 in 15-minute steps", () => {
    expect(START_MINUTE_OPTIONS).toHaveLength(96)
    expect(START_MINUTE_OPTIONS[0]).toBe(0)
    expect(START_MINUTE_OPTIONS.at(-1)).toBe(23 * 60 + 45)
    expect(
      START_MINUTE_OPTIONS.every((minute, index) => minute === index * 15),
    ).toBe(true)
  })

  test("end options run 00:15 to 24:00 (1440) in 15-minute steps", () => {
    expect(END_MINUTE_OPTIONS).toHaveLength(96)
    expect(END_MINUTE_OPTIONS[0]).toBe(15)
    expect(END_MINUTE_OPTIONS.at(-1)).toBe(1440)
  })

  test("formats minutes, rendering 1440 as 24:00", () => {
    expect(formatMinute(0)).toBe("00:00")
    expect(formatMinute(540)).toBe("09:00")
    expect(formatMinute(1425)).toBe("23:45")
    expect(formatMinute(1440)).toBe("24:00")
    expect(END_SELECT_ITEMS.at(-1)).toEqual({ label: "24:00", value: "1440" })
  })

  test("formats minute 1440 as 24:00", () => {
    expect(formatMinute(1440)).toBe("24:00")
    expect(formatMinute(0)).toBe("00:00")
    expect(formatMinute(23 * 60 + 45)).toBe("23:45")
  })
})
