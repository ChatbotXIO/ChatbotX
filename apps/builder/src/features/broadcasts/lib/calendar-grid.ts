import { resolveFilterTimezone } from "@chatbotx.io/utils/datetime"
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
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
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

export const CALENDAR_RANGES = ["month", "week", "day", "custom"] as const
export type CalendarRange = (typeof CALENDAR_RANGES)[number]

export const DATE_PARAM_FORMAT = "yyyy-MM-dd"
/** Span (in days, inclusive) a fresh "custom" range starts with when no `endDate` param is present or valid. */
export const DEFAULT_CUSTOM_RANGE_DAYS = 7
/** Upper bound (in days, inclusive) on how far `endDate` can sit past the anchor — bounds the query span. */
export const MAX_CUSTOM_RANGE_DAYS = 92
const DAY_KEY_FORMAT = "yyyy-MM-dd"
/** Zone-less wall clock, the input `fromZonedTime` reinterprets in a named zone. */
const WALL_CLOCK_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS"
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
 * here, in the user's `timezone` ("today" is a per-zone notion: 18:30 UTC is
 * already tomorrow in Saigon), and thread the result down as a concrete value.
 */
export function resolveDateParam(
  value: string | null,
  timezone: string,
  now = new Date(),
): string {
  if (value) {
    const parsed = parse(value, DATE_PARAM_FORMAT, now)
    if (isValid(parsed)) {
      return format(parsed, DATE_PARAM_FORMAT)
    }
  }
  return formatInTimeZone(
    now,
    resolveFilterTimezone(timezone),
    DATE_PARAM_FORMAT,
  )
}

/**
 * Parses the `?endDate=` param for the "custom" range. Falls back to
 * `anchor + (DEFAULT_CUSTOM_RANGE_DAYS - 1)` when the value is missing,
 * unparsable, or sits before the anchor (an end date can't precede its
 * start), and clamps a too-distant end date to
 * `anchor + (MAX_CUSTOM_RANGE_DAYS - 1)` so the query span stays bounded.
 */
export function parseEndDateParam(value: string | null, anchor: Date): Date {
  const fallback = addDays(anchor, DEFAULT_CUSTOM_RANGE_DAYS - 1)
  if (!value) {
    return fallback
  }
  const parsed = parse(value, DATE_PARAM_FORMAT, anchor)
  if (!isValid(parsed)) {
    return fallback
  }
  const parsedDay = startOfDay(parsed)
  if (parsedDay.getTime() < startOfDay(anchor).getTime()) {
    return fallback
  }
  const maxEnd = addDays(anchor, MAX_CUSTOM_RANGE_DAYS - 1)
  return parsedDay.getTime() > maxEnd.getTime() ? maxEnd : parsedDay
}

/**
 * Resolves the `?endDate=` param to a concrete `yyyy-MM-dd` string once, on
 * the server — mirrors `resolveDateParam`'s single-resolution rationale so
 * the server-rendered grid and the fetched rows never disagree.
 */
export function resolveEndDateParam(
  value: string | null,
  anchorValue: string,
): string {
  return format(
    parseEndDateParam(value, parseDateParam(anchorValue)),
    DATE_PARAM_FORMAT,
  )
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

function getCustomInterval(
  anchor: Date,
  endAnchor: Date,
): { from: Date; to: Date } {
  return { from: startOfDay(anchor), to: endOfDay(endAnchor) }
}

type CalendarStepResult = { date: Date; endDate: Date | null }

type CalendarRangeConfigEntry = {
  getVisibleInterval: (
    anchor: Date,
    endAnchor: Date,
  ) => { from: Date; to: Date }
  step: (anchor: Date, endAnchor: Date, direction: 1 | -1) => CalendarStepResult
  labelKey: `broadcasts.calendar.ranges.${CalendarRange}`
}

/** Map-driven range behaviour — the single source of truth for how each range computes its visible span, steps forward/back, and labels itself. Add a new range by adding an entry here, not an if/else chain. */
export const calendarRangeConfig: Record<
  CalendarRange,
  CalendarRangeConfigEntry
> = {
  month: {
    getVisibleInterval: getMonthInterval,
    step: (anchor, _endAnchor, direction) => ({
      date: direction === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1),
      endDate: null,
    }),
    labelKey: "broadcasts.calendar.ranges.month",
  },
  week: {
    getVisibleInterval: getWeekInterval,
    step: (anchor, _endAnchor, direction) => ({
      date: direction === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1),
      endDate: null,
    }),
    labelKey: "broadcasts.calendar.ranges.week",
  },
  day: {
    getVisibleInterval: getDayInterval,
    step: (anchor, _endAnchor, direction) => ({
      date: direction === 1 ? addDays(anchor, 1) : subDays(anchor, 1),
      endDate: null,
    }),
    labelKey: "broadcasts.calendar.ranges.day",
  },
  custom: {
    getVisibleInterval: getCustomInterval,
    step: (anchor, endAnchor, direction) => {
      const spanDays = differenceInCalendarDays(endAnchor, anchor) + 1
      const shift = direction === 1 ? spanDays : -spanDays
      return {
        date: addDays(anchor, shift),
        endDate: addDays(endAnchor, shift),
      }
    },
    labelKey: "broadcasts.calendar.ranges.custom",
  },
}

/**
 * The instant at which `wallClock`'s calendar date + time of day occurs in
 * `timezone`. `wallClock` is read by its local getters only, so the process
 * zone never leaks into the result.
 */
function wallClockToInstant(wallClock: Date, timezone: string): Date {
  return fromZonedTime(format(wallClock, WALL_CLOCK_FORMAT), timezone)
}

/**
 * Server-side query range: the visible interval's day boundaries as they
 * fall in the user's `timezone`, so the fetched rows are exactly the ones the
 * client grid (which groups by browser-local day) will show. An unusable
 * zone degrades to UTC.
 */
export function getCalendarQueryRange(
  range: CalendarRange,
  anchor: Date,
  endAnchor: Date,
  timezone: string,
): { from: Date; to: Date } {
  const { from, to } = calendarRangeConfig[range].getVisibleInterval(
    anchor,
    endAnchor,
  )
  const zone = resolveFilterTimezone(timezone)
  return {
    from: wallClockToInstant(from, zone),
    to: wallClockToInstant(to, zone),
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

/** Inclusive list of days from `anchor` through `endAnchor`, for the "custom" range's agenda body. */
export function buildRangeDays(anchor: Date, endAnchor: Date): Date[] {
  const spanDays = differenceInCalendarDays(endAnchor, anchor) + 1
  return Array.from({ length: spanDays }, (_, i) => addDays(anchor, i))
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
