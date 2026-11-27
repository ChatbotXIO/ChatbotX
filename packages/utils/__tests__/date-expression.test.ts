import { describe, expect, test } from "vitest"
import {
  addDateUnit,
  DATE_EXPRESSION_LIMITS,
  evaluateDateExpression,
} from "../src/field-value-calculator/date-expression"

const NOW = new Date("2026-03-10T05:30:00.000Z")
const evaluate = (expression: string, timeZone = "UTC", now = NOW) =>
  evaluateDateExpression(expression, { now, timeZone })?.toISOString() ?? null

describe("evaluateDateExpression", () => {
  test.each([
    ["now", "2026-03-10T05:30:00.000Z"],
    ["NOW + 1 day", "2026-03-11T05:30:00.000Z"],
    ["now - 2 hours", "2026-03-10T03:30:00.000Z"],
    ["now + 15min", "2026-03-10T05:45:00.000Z"],
    ["now +1w", "2026-03-17T05:30:00.000Z"],
    ["now + 1 month", "2026-04-10T05:30:00.000Z"],
    ["now + 1 year", "2027-03-10T05:30:00.000Z"],
    ["now + 1 day - 3 h + 20 minutes", "2026-03-11T02:50:00.000Z"],
    ["today", "2026-03-10T00:00:00.000Z"],
    ["today + 2d", "2026-03-12T00:00:00.000Z"],
  ])("%s", (expression, expected) => {
    expect(evaluate(expression)).toBe(expected)
  })

  test("units are case-insensitive like the keywords", () => {
    expect(evaluate("NOW + 2 Days - 3 HOURS")).toBe("2026-03-12T02:30:00.000Z")
  })

  test("a bare m is ambiguous and rejected", () => {
    expect(evaluate("now + 5 m")).toBeNull()
  })

  test("an ISO base keeps its own - and +offset", () => {
    expect(evaluate("2026-05-01T10:00:00+07:00 + 1 day")).toBe(
      "2026-05-02T03:00:00.000Z",
    )
    expect(evaluate("2026-05-01T10:00:00Z - 1 day")).toBe(
      "2026-04-30T10:00:00.000Z",
    )
  })

  test("a naive base is anchored in the clock zone", () => {
    expect(evaluate("2026-05-01 + 1 day", "Asia/Ho_Chi_Minh")).toBe(
      "2026-05-01T17:00:00.000Z",
    )
  })

  test("rejects malformed expressions", () => {
    for (const expression of [
      "",
      "   ",
      "garbage",
      "now + ",
      "now + 1",
      "now + 1.5 days",
      "now + 1 fortnight",
      "now 1 day",
      "now ++ 1 day",
      "now+1day",
    ]) {
      expect(evaluate(expression)).toBeNull()
    }
  })

  test("enforces term count and magnitude limits", () => {
    const terms = (count: number) =>
      Array.from({ length: count }, () => "+ 1 min").join(" ")
    expect(
      evaluate(`now ${terms(DATE_EXPRESSION_LIMITS.maxTerms)}`),
    ).not.toBeNull()
    expect(
      evaluate(`now ${terms(DATE_EXPRESSION_LIMITS.maxTerms + 1)}`),
    ).toBeNull()
    expect(
      evaluate(`now + ${DATE_EXPRESSION_LIMITS.maxMagnitude} min`),
    ).not.toBeNull()
    expect(
      evaluate(`now + ${DATE_EXPRESSION_LIMITS.maxMagnitude + 1} min`),
    ).toBeNull()
    expect(evaluate("now + 100000 year")).toBeNull()
  })

  describe("calendar arithmetic", () => {
    test("clamps the month end and handles a leap day", () => {
      const jan31 = new Date("2026-01-31T10:00:00.000Z")
      expect(evaluate("now + 1 month", "UTC", jan31)).toBe(
        "2026-02-28T10:00:00.000Z",
      )
      const leap = new Date("2028-02-29T10:00:00.000Z")
      expect(evaluate("now + 1 year", "UTC", leap)).toBe(
        "2029-02-28T10:00:00.000Z",
      )
      expect(
        evaluate("now - 1 month", "UTC", new Date("2026-03-31T10:00:00.000Z")),
      ).toBe("2026-02-28T10:00:00.000Z")
    })

    test("a day is a calendar day across the spring-forward gap", () => {
      // New York: clocks jump 02:00 -> 03:00 on 2026-03-08.
      const before = new Date("2026-03-07T15:30:00.000Z") // 10:30 EST
      expect(evaluate("now + 1 day", "America/New_York", before)).toBe(
        "2026-03-08T14:30:00.000Z", // 10:30 EDT, only 23 real hours later
      )
      expect(evaluate("now + 24 hours", "America/New_York", before)).toBe(
        "2026-03-08T15:30:00.000Z",
      )
    })

    test("a nonexistent local time moves forward by the gap", () => {
      const before = new Date("2026-03-07T07:30:00.000Z") // 02:30 EST
      expect(evaluate("now + 1 day", "America/New_York", before)).toBe(
        "2026-03-08T07:30:00.000Z", // 03:30 EDT
      )
    })

    test("an ambiguous local time picks the earlier instant on the autumn fold", () => {
      const before = new Date("2026-10-31T05:30:00.000Z") // 01:30 EDT
      expect(evaluate("now + 1 day", "America/New_York", before)).toBe(
        "2026-11-01T05:30:00.000Z", // first 01:30 (EDT)
      )
    })

    test("handles a zone that skipped a whole day", () => {
      // Pacific/Apia skipped 2011-12-30.
      const before = new Date("2011-12-29T10:00:00.000Z")
      const result = evaluateDateExpression("now + 1 day", {
        now: before,
        timeZone: "Pacific/Apia",
      })
      expect(result).not.toBeNull()
      expect(result?.getTime()).toBeGreaterThan(before.getTime())
    })

    test("keeps sub-minute precision", () => {
      const precise = new Date("2026-03-10T05:30:45.123Z")
      expect(evaluate("now + 1 day", "UTC", precise)).toBe(
        "2026-03-11T05:30:45.123Z",
      )
    })

    test("rejects results outside the representable years", () => {
      expect(addDateUnit(NOW, "year", -3000, "UTC")).toBeNull()
      expect(addDateUnit(NOW, "year", 9000, "UTC")).toBeNull()
    })
  })
})
