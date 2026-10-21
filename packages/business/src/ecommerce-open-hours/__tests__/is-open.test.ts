import { describe, expect, test } from "vitest"
import { isWithinOpenHours } from "../is-open"

// 2026-10-19 is a Monday.
const at = (iso: string) => new Date(iso)

describe("isWithinOpenHours", () => {
  const weekdays = [{ day: 1, from: "09:00", to: "17:00" }]

  test("is open inside the range, in the workspace timezone", () => {
    // 09:30 in Ho Chi Minh City is 02:30 UTC.
    expect(
      isWithinOpenHours(
        weekdays,
        "Asia/Ho_Chi_Minh",
        at("2026-10-19T02:30:00Z"),
      ),
    ).toBe(true)
  })

  test("is closed before the range and at its end", () => {
    expect(
      isWithinOpenHours(
        weekdays,
        "Asia/Ho_Chi_Minh",
        at("2026-10-19T01:59:00Z"),
      ),
    ).toBe(false)
    expect(
      isWithinOpenHours(
        weekdays,
        "Asia/Ho_Chi_Minh",
        at("2026-10-19T10:00:00Z"),
      ),
    ).toBe(false)
  })

  test("is closed on another day", () => {
    expect(isWithinOpenHours(weekdays, "UTC", at("2026-10-20T10:00:00Z"))).toBe(
      false,
    )
  })

  test("a range past midnight covers the early hours of the next day", () => {
    const late = [{ day: 1, from: "22:00", to: "02:00" }]
    expect(isWithinOpenHours(late, "UTC", at("2026-10-19T23:00:00Z"))).toBe(
      true,
    )
    expect(isWithinOpenHours(late, "UTC", at("2026-10-20T01:30:00Z"))).toBe(
      true,
    )
    expect(isWithinOpenHours(late, "UTC", at("2026-10-20T02:00:00Z"))).toBe(
      false,
    )
    expect(isWithinOpenHours(late, "UTC", at("2026-10-19T21:00:00Z"))).toBe(
      false,
    )
  })

  test("no ranges is never open", () => {
    expect(isWithinOpenHours([], "UTC", at("2026-10-19T10:00:00Z"))).toBe(false)
  })
})
