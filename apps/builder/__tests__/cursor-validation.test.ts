import { describe, expect, test } from "vitest"
import {
  invalidCursorException,
  isCursorTimeInRange,
} from "@/lib/pagination/cursor-validation"

describe("isCursorTimeInRange", () => {
  test.each([
    ["now", "2026-11-23T10:00:00.000Z"],
    ["the first moment of year 1", "0001-01-01T00:00:00.000Z"],
    ["the last moment of year 9999", "9999-12-31T23:59:59.999Z"],
  ])("accepts %s", (_label, time) => {
    expect(isCursorTimeInRange(new Date(time))).toBe(true)
  })

  test.each([
    ["a time before year 1", "-000001-12-31T23:59:59.999Z"],
    ["a time far before year 1", "-010000-01-01T00:00:00.000Z"],
    ["a time past year 9999", "+010000-01-01T00:00:00.000Z"],
  ])("rejects %s", (_label, time) => {
    expect(isCursorTimeInRange(new Date(time))).toBe(false)
  })
})

describe("invalidCursorException", () => {
  test("is a 400 with the invalidCursor code", () => {
    expect(invalidCursorException()).toMatchObject({
      code: "invalidCursor",
      httpStatusCode: 400,
    })
  })
})
