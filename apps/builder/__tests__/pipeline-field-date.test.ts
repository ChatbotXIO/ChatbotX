// @vitest-environment node

import { describe, expect, test } from "vitest"
import { storedDateToDay } from "../src/features/custom-fields/lib/field-date"

describe("storedDateToDay", () => {
  test("a UTC+7 writer's stored start of day reads as the picked day", () => {
    expect(
      storedDateToDay("2026-05-20T00:00:00+07:00", "Asia/Ho_Chi_Minh"),
    ).toBe("2026-05-20")
  })

  test("a zero-offset Z start of day keeps its day for a west-of-UTC viewer", () => {
    expect(storedDateToDay("2026-01-20T00:00:00Z", "America/New_York")).toBe(
      "2026-01-20",
    )
    expect(
      storedDateToDay("2026-01-20T00:00:00.000Z", "America/New_York"),
    ).toBe("2026-01-20")
  })

  test("a freshly picked bare day is unchanged in negative-offset zones", () => {
    expect(storedDateToDay("2026-05-20", "America/Bogota")).toBe("2026-05-20")
    expect(storedDateToDay("2026-05-20", "Asia/Ho_Chi_Minh")).toBe("2026-05-20")
  })

  test("keeps the authored day of an offset-bearing stored value", () => {
    expect(storedDateToDay("2026-05-20T00:00:00+07:00", "America/Bogota")).toBe(
      "2026-05-20",
    )
  })

  test("shows the picked day for a UTC-5 writer", () => {
    expect(storedDateToDay("2026-05-20T05:00:00.000Z", "America/Bogota")).toBe(
      "2026-05-20",
    )
  })

  test("keeps a UTC start-of-day value on the same day in UTC", () => {
    expect(storedDateToDay("2026-05-20T00:00:00.000Z", "UTC")).toBe(
      "2026-05-20",
    )
  })

  test("returns blank for blank and the date prefix for garbage", () => {
    expect(storedDateToDay("", "UTC")).toBe("")
    expect(storedDateToDay("2026-05-20-oops", "UTC")).toBe("2026-05-20")
  })
})
