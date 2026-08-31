import {
  addDays,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns"

export const MONTH_PARAM_FORMAT = "yyyy-MM"
/** > 26 h (largest offset difference between two zones), so the padded range holds in any server zone. */
export const CALENDAR_RANGE_PADDING_DAYS = 2
const DAY_KEY_FORMAT = "yyyy-MM-dd"
const WEEK_STARTS_ON = 1 as const

export function parseMonthParam(value: string | null, now = new Date()): Date {
  if (value) {
    const parsed = parse(value, MONTH_PARAM_FORMAT, now)
    if (isValid(parsed)) {
      return startOfMonth(parsed)
    }
  }
  return startOfMonth(now)
}

/**
 * Resolves the `?month=` param to a concrete `yyyy-MM` string once, on the
 * server. The server and client must never independently call
 * `parseMonthParam(null)` for the "current month" default — around a month
 * boundary, distant time zones can disagree on what "now" is, so the grid
 * (client) and the fetched rows (server) could end up describing different
 * months. Resolve here and thread the result down as a concrete value.
 */
export function resolveMonthParam(
  value: string | null,
  now = new Date(),
): string {
  return format(parseMonthParam(value, now), MONTH_PARAM_FORMAT)
}

export function getMonthRange(month: Date): { from: Date; to: Date } {
  return {
    from: startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
    to: endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
  }
}

/** Server-side query range: the visible grid padded so no row is lost across the timezone edge. */
export function getCalendarQueryRange(month: Date): { from: Date; to: Date } {
  const { from, to } = getMonthRange(month)
  return {
    from: subDays(from, CALENDAR_RANGE_PADDING_DAYS),
    to: addDays(to, CALENDAR_RANGE_PADDING_DAYS),
  }
}

export function buildMonthGrid(month: Date): Date[][] {
  const { from, to } = getMonthRange(month)
  return eachWeekOfInterval(
    { start: from, end: to },
    { weekStartsOn: WEEK_STARTS_ON },
  ).map((weekStart) =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  )
}

export function dayKey(date: Date): string {
  return format(date, DAY_KEY_FORMAT)
}

export function groupByDay<T extends { schedulesAt: Date }>(
  rows: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const key = dayKey(row.schedulesAt)
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }
  return grouped
}
