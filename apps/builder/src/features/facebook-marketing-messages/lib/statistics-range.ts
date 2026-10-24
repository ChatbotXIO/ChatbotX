import { addDays, endOfMonth, format, startOfMonth, subMonths } from "date-fns"

/**
 * Date ranges for the Statistics tab. Meta reports insights in the ad
 * account's timezone, so "today" is the account's calendar day, not the
 * browser's or the server's. Shared by the server (default range) and the
 * client (preset picker) — keep it free of server-only imports.
 */

export const STATISTICS_PRESETS = [
  "last7",
  "last30",
  "last90",
  "thisMonth",
  "lastMonth",
] as const
export type StatisticsPreset = (typeof STATISTICS_PRESETS)[number]

/** Meta keeps insights for 37 months. */
export const STATISTICS_MAX_RANGE_MONTHS = 37

export const DAY_FORMAT = "yyyy-MM-dd"

/** `YYYY-MM-DD` as a local-midnight Date, so date-fns math stays on calendar days. */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1)
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

const LAST_N_DAYS: Partial<Record<StatisticsPreset, number>> = {
  last7: 7,
  last30: 30,
  last90: 90,
}

/**
 * "Last N days" includes today, so a campaign sent today shows up in the
 * default view (Meta's own `last_30d` excludes today).
 */
export function statisticsPresetRange(
  preset: StatisticsPreset,
  timeZone: string,
  now = new Date(),
): { since: string; until: string } {
  const today = parseDay(todayInTimeZone(timeZone, now))
  const days = LAST_N_DAYS[preset]
  if (days) {
    return {
      since: format(addDays(today, -(days - 1)), DAY_FORMAT),
      until: format(today, DAY_FORMAT),
    }
  }
  if (preset === "thisMonth") {
    return {
      since: format(startOfMonth(today), DAY_FORMAT),
      until: format(today, DAY_FORMAT),
    }
  }
  const previous = subMonths(today, 1)
  return {
    since: format(startOfMonth(previous), DAY_FORMAT),
    until: format(endOfMonth(previous), DAY_FORMAT),
  }
}

export function isRangeWithinLimit(since: string, until: string): boolean {
  if (since > until) {
    return false
  }
  const earliest = format(
    subMonths(parseDay(until), STATISTICS_MAX_RANGE_MONTHS),
    DAY_FORMAT,
  )
  return since >= earliest
}
