import { describe, expect, test } from "vitest"
import { getSafeSinceTime } from "../src/repositories/message"

describe("getSafeSinceTime", () => {
  test("accepts Date instances", () => {
    const result = getSafeSinceTime(new Date("2026-07-15T10:34:56.000Z"))

    expect(result?.toISOString()).toBe("2026-07-15T09:00:00.000Z")
  })

  test("accepts ISO strings from JSON payloads", () => {
    const result = getSafeSinceTime("2026-07-15T10:34:56.000Z")

    expect(result?.toISOString()).toBe("2026-07-15T09:00:00.000Z")
  })

  test("accepts numeric timestamps", () => {
    const timestamp = new Date("2026-07-15T10:34:56.000Z").getTime()
    const result = getSafeSinceTime(timestamp)

    expect(result?.toISOString()).toBe("2026-07-15T09:00:00.000Z")
  })

  test("returns undefined for invalid strings", () => {
    expect(getSafeSinceTime("not-a-date")).toBeUndefined()
  })

  test("applies an explicit buffer before flooring to the hour", () => {
    const result = getSafeSinceTime("2026-07-15T10:34:56.000Z", 60 * 60 * 1000)

    expect(result?.toISOString()).toBe("2026-07-15T09:00:00.000Z")
  })
})
