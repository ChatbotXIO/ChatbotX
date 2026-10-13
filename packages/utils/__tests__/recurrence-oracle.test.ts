import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { describe, expect, test } from "vitest"
import {
  computeLatestOccurrence,
  computeNextOccurrence,
  listUpcomingOccurrences,
  type RecurrenceRule,
} from "../src/recurrence"

/**
 * An independent oracle: walk every calendar day from the start date and keep
 * the days the rule's plain-language definition selects. It shares no code with
 * the period arithmetic under test, so a combination of frequency, interval,
 * weekdays, month day, end and timezone that the two disagree on is a bug in
 * one of them.
 */
const DAY_MS = 86_400_000
const parseDay = (value: string) => {
  const [year, month, day] = value.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const lastDayOfMonth = (ms: number) => {
  const d = new Date(ms)
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate()
}
/** Monday-based week number of a day, counted from a fixed Monday. */
const weekIndex = (ms: number) =>
  Math.floor((ms - Date.UTC(2024, 0, 1)) / (7 * DAY_MS))

const selects = (rule: RecurrenceRule, ms: number): boolean => {
  const start = parseDay(rule.startsOn)
  if (ms < start) {
    return false
  }
  const date = new Date(ms)
  if (rule.frequency === "daily") {
    return Math.round((ms - start) / DAY_MS) % rule.interval === 0
  }
  if (rule.frequency === "weekly") {
    return (
      (weekIndex(ms) - weekIndex(start)) % rule.interval === 0 &&
      (rule.weekdays ?? []).includes(date.getUTCDay())
    )
  }
  const monthsApart =
    (date.getUTCFullYear() - new Date(start).getUTCFullYear()) * 12 +
    date.getUTCMonth() -
    new Date(start).getUTCMonth()
  if (monthsApart % rule.interval !== 0) {
    return false
  }
  const target =
    rule.monthDay === "last"
      ? lastDayOfMonth(ms)
      : Math.min(rule.monthDay as number, lastDayOfMonth(ms))
  return date.getUTCDate() === target
}

const oracle = (rule: RecurrenceRule, days = 2500): Date[] => {
  const start = parseDay(rule.startsOn)
  const out: Date[] = []
  for (let i = 0; i < days; i += 1) {
    const ms = start + i * DAY_MS
    if (!selects(rule, ms)) {
      continue
    }
    const instant = fromZonedTime(
      `${isoDay(ms)}T${rule.timeOfDay}:00`,
      rule.timezone,
    )
    if (rule.end.kind === "onDate" && isoDay(ms) > rule.end.date) {
      break
    }
    out.push(instant)
    if (rule.end.kind === "afterOccurrences" && out.length >= rule.end.count) {
      break
    }
  }
  return out
}

const base = {
  timeOfDay: "12:00",
  end: { kind: "never" },
} as const

const rules: { name: string; rule: RecurrenceRule }[] = []
const zones = [
  "UTC",
  "Asia/Ho_Chi_Minh",
  "America/New_York",
  "Pacific/Auckland",
]
const starts = [
  "2026-01-31",
  "2026-02-28",
  "2026-03-01",
  "2026-10-11",
  "2026-10-12",
  "2026-12-30",
]
const ends: RecurrenceRule["end"][] = [
  { kind: "never" },
  { kind: "onDate", date: "2027-02-14" },
  { kind: "afterOccurrences", count: 4 },
]
for (const timezone of zones) {
  for (const startsOn of starts) {
    for (const end of ends) {
      for (const interval of [1, 2, 3]) {
        rules.push({
          name: `daily/${interval} ${timezone} ${startsOn} ${end.kind}`,
          rule: {
            ...base,
            frequency: "daily",
            interval,
            timezone,
            startsOn,
            end,
          },
        })
        for (const weekdays of [[1, 2, 3, 4, 5], [0], [6, 0], [1, 4], [3]]) {
          rules.push({
            name: `weekly/${interval} ${weekdays} ${timezone} ${startsOn} ${end.kind}`,
            rule: {
              ...base,
              frequency: "weekly",
              interval,
              weekdays,
              timezone,
              startsOn,
              end,
            },
          })
        }
        for (const monthDay of [1, 15, 29, 30, 31, "last"] as const) {
          rules.push({
            name: `monthly/${interval} ${monthDay} ${timezone} ${startsOn} ${end.kind}`,
            rule: {
              ...base,
              frequency: "monthly",
              interval,
              monthDay,
              timezone,
              startsOn,
              end,
            },
          })
        }
      }
    }
  }
}

// Thousands of combinations: slow enough to hit the default timeout when the
// whole workspace's tests run in parallel.
const ORACLE_TIMEOUT_MS = 120_000

describe("recurrence math against an independent day-by-day oracle", {
  timeout: ORACLE_TIMEOUT_MS,
}, () => {
  test(`covers ${rules.length} combinations`, () => {
    expect(rules.length).toBeGreaterThan(1500)
  })

  test("listUpcomingOccurrences from before the start lists exactly the oracle's runs", () => {
    const mismatches: string[] = []
    for (const { name, rule } of rules) {
      const expected = oracle(rule).slice(0, 12)
      const actual = listUpcomingOccurrences(rule, {
        after: new Date(parseDay(rule.startsOn) - 3 * DAY_MS),
        occurrenceCount: 0,
        limit: 12,
      })
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(
          `${name}\n  oracle ${expected.slice(0, 3).map((d) => d.toISOString())}\n  actual ${actual.slice(0, 3).map((d) => d.toISOString())}`,
        )
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([])
  })

  test("excludeDates removes exactly the oracle runs on those local dates", () => {
    const mismatches: string[] = []
    for (const { name, rule } of rules) {
      const uncapped: RecurrenceRule =
        rule.end.kind === "afterOccurrences"
          ? { ...rule, end: { kind: "never" } }
          : rule
      const localDate = (instant: Date) =>
        formatInTimeZone(instant, rule.timezone, "yyyy-MM-dd")
      const all = oracle(uncapped).slice(0, 14)
      const excludeDates = [all[1], all[3], all[4]]
        .filter((instant): instant is Date => Boolean(instant))
        .map(localDate)
      const withSkips: RecurrenceRule = { ...rule, excludeDates }
      const survivors = all.filter(
        (instant) => !excludeDates.includes(localDate(instant)),
      )
      // Skipped slots consume no run budget, so the count caps survivors only.
      const budget =
        rule.end.kind === "afterOccurrences" ? rule.end.count : survivors.length
      const expected = survivors.slice(0, budget)
      const actual = listUpcomingOccurrences(withSkips, {
        after: new Date(parseDay(rule.startsOn) - 3 * DAY_MS),
        occurrenceCount: 0,
        limit: expected.length,
      })
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(name)
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([])
  })

  test("stepping with computeNextOccurrence walks the same sequence", () => {
    const mismatches: string[] = []
    for (const { name, rule } of rules) {
      const expected = oracle(rule).slice(0, 8)
      const walked: Date[] = []
      let after = new Date(parseDay(rule.startsOn) - DAY_MS)
      for (let count = 0; walked.length < expected.length; count += 1) {
        const next = computeNextOccurrence(rule, {
          after,
          occurrenceCount: count,
        })
        if (!next) {
          break
        }
        walked.push(next)
        after = next
      }
      if (JSON.stringify(walked) !== JSON.stringify(expected)) {
        mismatches.push(name)
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([])
  })

  test("computeLatestOccurrence is the last oracle run at or before any instant", () => {
    const mismatches: string[] = []
    for (const { name, rule } of rules) {
      // A run count caps how many runs are made, not which slot the last one
      // lands on: after an outage the catch-up run takes the latest slot, so
      // the uncapped schedule is the reference and the count only decides
      // whether any run is left.
      const uncapped: RecurrenceRule =
        rule.end.kind === "afterOccurrences"
          ? { ...rule, end: { kind: "never" } }
          : rule
      const all = oracle(uncapped)
      for (const probe of [20, 100, 333]) {
        const at = new Date(
          parseDay(rule.startsOn) + probe * DAY_MS + 7 * 3_600_000,
        )
        const expected = all.filter((d) => d <= at).at(-1) ?? null
        for (const occurrenceCount of [0, 3, 4]) {
          const exhausted =
            rule.end.kind === "afterOccurrences" &&
            occurrenceCount >= rule.end.count
          const actual = computeLatestOccurrence(rule, {
            atOrBefore: at,
            occurrenceCount,
          })
          const want = exhausted ? null : expected
          if (actual?.getTime() !== want?.getTime()) {
            mismatches.push(`${name} @+${probe}d count ${occurrenceCount}`)
          }
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([])
  })
})
