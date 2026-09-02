import {
  addDays,
  addMonths,
  addWeeks,
  eachWeekOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns"

export const CALENDAR_RANGES = ["month", "week", "day"] as const
export type CalendarRange = (typeof CALENDAR_RANGES)[number]

export const DATE_PARAM_FORMAT = "yyyy-MM-dd"
/** > 26 h (largest offset difference between two zones), so the padded range holds in any server zone. */
export const CALENDAR_RANGE_PADDING_DAYS = 2
const DAY_KEY_FORMAT = "yyyy-MM-dd"
const WEEK_STARTS_ON = 1 as const

export function parseDateParam(value: string | null, now = new Date()): Date {
  if (value) {
    const parsed = parse(value, DATE_PARAM_FORMAT, now)
    if (isValid(parsed)) {
      return startOfDay(parsed)
    }
  }
  return startOfDay(now)
}

/**
 * Resolves the `?date=` param to a concrete `yyyy-MM-dd` string once, on the
 * server. The server and client must never independently call
 * `parseDateParam(null)` for the "today" default — around a day boundary,
 * distant time zones can disagree on what "now" is, so the grid (client) and
 * the fetched rows (server) could end up describing different days. Resolve
 * here and thread the result down as a concrete value.
 */
export function resolveDateParam(
  value: string | null,
  now = new Date(),
): string {
  return format(parseDateParam(value, now), DATE_PARAM_FORMAT)
}

function getMonthInterval(anchor: Date): { from: Date; to: Date } {
  return {
    from: startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON }),
    to: endOfWeek(endOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON }),
  }
}

function getWeekInterval(anchor: Date): { from: Date; to: Date } {
  return {
    from: startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON }),
    to: endOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON }),
  }
}

function getDayInterval(anchor: Date): { from: Date; to: Date } {
  return { from: startOfDay(anchor), to: endOfDay(anchor) }
}

type CalendarRangeConfigEntry = {
  getVisibleInterval: (anchor: Date) => { from: Date; to: Date }
  step: (anchor: Date, direction: 1 | -1) => Date
  labelKey: `broadcasts.calendar.ranges.${CalendarRange}`
}

/** Map-driven range behaviour — the single source of truth for how each range computes its visible span, steps forward/back, and labels itself. Add a new range by adding an entry here, not an if/else chain. */
export const calendarRangeConfig: Record<
  CalendarRange,
  CalendarRangeConfigEntry
> = {
  month: {
    getVisibleInterval: getMonthInterval,
    step: (anchor, direction) =>
      direction === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1),
    labelKey: "broadcasts.calendar.ranges.month",
  },
  week: {
    getVisibleInterval: getWeekInterval,
    step: (anchor, direction) =>
      direction === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1),
    labelKey: "broadcasts.calendar.ranges.week",
  },
  day: {
    getVisibleInterval: getDayInterval,
    step: (anchor, direction) =>
      direction === 1 ? addDays(anchor, 1) : subDays(anchor, 1),
    labelKey: "broadcasts.calendar.ranges.day",
  },
}

/** Server-side query range: the visible range padded so no row is lost across the timezone edge. */
export function getCalendarQueryRange(
  range: CalendarRange,
  anchor: Date,
): { from: Date; to: Date } {
  const { from, to } = calendarRangeConfig[range].getVisibleInterval(anchor)
  return {
    from: subDays(from, CALENDAR_RANGE_PADDING_DAYS),
    to: addDays(to, CALENDAR_RANGE_PADDING_DAYS),
  }
}

export function buildMonthGrid(anchor: Date): Date[][] {
  const { from, to } = getMonthInterval(anchor)
  return eachWeekOfInterval(
    { start: from, end: to },
    { weekStartsOn: WEEK_STARTS_ON },
  ).map((weekStart) =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  )
}

export function buildWeekDays(anchor: Date): Date[] {
  const { from } = getWeekInterval(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(from, i))
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

export function sortBySchedulesAt<T extends { schedulesAt: Date }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) => a.schedulesAt.getTime() - b.schedulesAt.getTime(),
  )
}
