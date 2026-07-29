import { describe, expect, test } from "vitest"
import type { DateTimeCondition } from "../src/trigger/utils/datetime-calculator"
import {
  matchesDateTimeCondition,
  parseDateTimeValue,
} from "../src/trigger/utils/datetime-calculator"

// Regression guard for the shared multi-tenant sweep: a corrupt or crafted
// Condition.value.timezone (only length-bounded at save time) must degrade to
// UTC, never throw a RangeError that would crash the whole tick for every
// workspace scheduled on it.
describe("datetime-calculator timezone guard", () => {
  const storedInstant = "2026-07-10T17:00:00.000Z"

  test("parseDateTimeValue degrades an invalid IANA zone to UTC instead of throwing", () => {
    expect(() => parseDateTimeValue(storedInstant, "Not/AZone")).not.toThrow()

    // Falls back to UTC: 17:00 on 2026-07-10.
    const parsed = parseDateTimeValue(storedInstant, "Not/AZone")
    expect(parsed).not.toBeNull()
    expect(parsed?.getHours()).toBe(17)
    expect(parsed?.getDate()).toBe(10)
  })

  test("parseDateTimeValue resolves a valid zone correctly", () => {
    // 17:00 UTC === 00:00 the next day in Asia/Ho_Chi_Minh (+7).
    const parsed = parseDateTimeValue(storedInstant, "Asia/Ho_Chi_Minh")
    expect(parsed?.getHours()).toBe(0)
    expect(parsed?.getDate()).toBe(11)
  })

  test("matchesDateTimeCondition does not throw on an invalid IANA zone", () => {
    const condition: DateTimeCondition = {
      customFieldId: "cf-1",
      triggerType: "atTheDayOf",
    }
    const datetimeValue = parseDateTimeValue(storedInstant, "Not/AZone")
    expect(datetimeValue).not.toBeNull()

    expect(() =>
      matchesDateTimeCondition(
        datetimeValue as Date,
        condition,
        { startOfMinute: new Date(storedInstant).getTime() },
        "Not/AZone",
      ),
    ).not.toThrow()
  })
})
