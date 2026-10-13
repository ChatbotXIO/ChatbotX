import { recurrenceRuleSchema } from "@chatbotx.io/utils/recurrence"
import { describe, expect, test } from "vitest"
import {
  applyFrequency,
  buildDefaultRecurrenceRule,
  todayIn,
} from "@/components/recurrence/recurrence-defaults"

describe("todayIn", () => {
  test("reads the date in the given zone, not the machine's", () => {
    const instant = new Date("2026-10-15T20:30:00Z")
    expect(todayIn("UTC", instant)).toBe("2026-10-15")
    expect(todayIn("Asia/Ho_Chi_Minh", instant)).toBe("2026-10-16")
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-10-15")
  })
})

describe("buildDefaultRecurrenceRule", () => {
  test("starts weekly, Monday to Friday at 08:00, never ending", () => {
    const rule = buildDefaultRecurrenceRule(
      "UTC",
      new Date("2026-10-15T09:07:00Z"),
    )
    expect(rule).toEqual({
      frequency: "weekly",
      interval: 1,
      weekdays: [1, 2, 3, 4, 5],
      timeOfDay: "08:00",
      timezone: "UTC",
      startsOn: "2026-10-15",
      end: { kind: "never" },
    })
  })

  test("does not depend on the day or the hour it is chosen", () => {
    for (const now of [
      "2026-10-18T10:00:00Z", // a Sunday
      "2026-10-15T23:50:00Z",
      "2026-10-19T00:05:00Z",
    ]) {
      const rule = buildDefaultRecurrenceRule("UTC", new Date(now))
      expect(rule.weekdays).toEqual([1, 2, 3, 4, 5])
      expect(rule.timeOfDay).toBe("08:00")
    }
  })

  test("starts on today's date in the user's zone", () => {
    // 20:30Z Thursday is already Friday in Ho Chi Minh City.
    const rule = buildDefaultRecurrenceRule(
      "Asia/Ho_Chi_Minh",
      new Date("2026-10-15T20:30:00Z"),
    )
    expect(rule.startsOn).toBe("2026-10-16")
    expect(rule.timezone).toBe("Asia/Ho_Chi_Minh")
  })

  test("hands out its own weekday list, never a shared one", () => {
    const first = buildDefaultRecurrenceRule("UTC", new Date())
    first.weekdays?.push(6)
    expect(buildDefaultRecurrenceRule("UTC", new Date()).weekdays).toEqual([
      1, 2, 3, 4, 5,
    ])
  })

  test("is accepted by the rule schema as it stands", () => {
    const rule = buildDefaultRecurrenceRule(
      "Europe/London",
      new Date("2026-10-15T09:07:00Z"),
    )
    expect(recurrenceRuleSchema.safeParse(rule).success).toBe(true)
  })
})

describe("applyFrequency", () => {
  const weekly = buildDefaultRecurrenceRule(
    "UTC",
    new Date("2026-10-15T09:07:00Z"),
  )

  test.each([
    "daily",
    "weekly",
    "monthly",
  ] as const)("%s keeps a valid rule", (frequency) => {
    const next = applyFrequency(weekly, frequency, undefined)
    expect(recurrenceRuleSchema.safeParse(next).success).toBe(true)
  })

  test("daily clears the weekday and month-day fields", () => {
    const next = applyFrequency(weekly, "daily", undefined)
    expect(next.weekdays).toBeUndefined()
    expect(next.monthDay).toBeUndefined()
  })

  test("monthly defaults to the start date's day and drops weekdays", () => {
    const next = applyFrequency(weekly, "monthly", undefined)
    expect(next.monthDay).toBe(15)
    expect(next.weekdays).toBeUndefined()
  })

  test("weekly restores the weekdays the user had picked", () => {
    const daily = applyFrequency(weekly, "daily", undefined)
    const back = applyFrequency(daily, "weekly", [1, 3])
    expect(back.weekdays).toEqual([1, 3])
  })

  test("weekly falls back to Monday to Friday when none was remembered", () => {
    const daily = applyFrequency(weekly, "daily", undefined)
    expect(applyFrequency(daily, "weekly", undefined).weekdays).toEqual([
      1, 2, 3, 4, 5,
    ])
  })

  test("clamps an interval that the new unit does not allow", () => {
    const everyHundredDays = {
      ...weekly,
      frequency: "daily" as const,
      interval: 100,
    }
    expect(applyFrequency(everyHundredDays, "weekly", undefined).interval).toBe(
      52,
    )
    expect(
      applyFrequency(everyHundredDays, "monthly", undefined).interval,
    ).toBe(24)
  })

  test("keeps the time, zone, start and end untouched", () => {
    const next = applyFrequency(weekly, "monthly", undefined)
    expect(next.timeOfDay).toBe(weekly.timeOfDay)
    expect(next.timezone).toBe(weekly.timezone)
    expect(next.startsOn).toBe(weekly.startsOn)
    expect(next.end).toEqual(weekly.end)
  })
})
