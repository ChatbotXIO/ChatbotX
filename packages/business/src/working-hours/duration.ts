import { formatInTimeZone } from "date-fns-tz"

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
const MINUTES_PER_DAY = 1440

export type WorkingInterval = {
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number
  startMinute: number
  /** End-exclusive; 1440 = next local date 00:00. */
  endMinute: number
}

/** A day's open ranges (`[]` = closed all day) replacing the weekly intervals for that local date. */
export type WorkingDateRanges = readonly {
  startMinute: number
  endMinute: number
}[]

/** Local date (`YYYY-MM-DD` in the schedule timezone) -> that date's ranges. */
export type WorkingDateOverrides = ReadonlyMap<string, WorkingDateRanges>

const formatters = new Map<string, Intl.DateTimeFormat>()

/**
 * UTC offset (ms) of `timezone` at an instant, read straight from Intl.
 * (`date-fns-tz` `getTimezoneOffset` returns the wrong offset in the hour
 * AFTER a transition, so it is not used here.)
 */
function offsetAt(timezone: string, instantMs: number): number {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
    formatters.set(timezone, formatter)
  }
  const wholeSecondMs = Math.floor(instantMs / 1000) * 1000
  const parts: Record<string, number> = {}
  for (const part of formatter.formatToParts(new Date(wholeSecondMs))) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value)
    }
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asUtc - wholeSecondMs
}

type LocalDate = { year: number; month: number; day: number }

/**
 * Wall-clock minute-of-day on a local date -> instant (ms).
 *
 * DST policy (explicit, not inherited from the library):
 * - nonexistent time (spring gap) -> the transition instant, i.e. the first
 *   valid instant at or after it;
 * - ambiguous time (fall-back overlap) -> the first occurrence.
 */
function wallMinuteToInstant(
  date: LocalDate,
  minute: number,
  timezone: string,
): number {
  const wallMs =
    Date.UTC(date.year, date.month - 1, date.day) + minute * MS_PER_MINUTE
  // Offsets a day either side bracket any transition touching this wall time.
  const offsetBefore = offsetAt(timezone, wallMs - MS_PER_DAY)
  const offsetAfter = offsetAt(timezone, wallMs + MS_PER_DAY)
  if (offsetBefore === offsetAfter) {
    return wallMs - offsetBefore
  }
  const candidateBefore = wallMs - offsetBefore
  const candidateAfter = wallMs - offsetAfter
  const beforeValid = offsetAt(timezone, candidateBefore) === offsetBefore
  const afterValid = offsetAt(timezone, candidateAfter) === offsetAfter
  if (beforeValid && afterValid) {
    return Math.min(candidateBefore, candidateAfter)
  }
  if (beforeValid) {
    return candidateBefore
  }
  if (afterValid) {
    return candidateAfter
  }
  // Gap: the wall time never happens. Bisect for the transition instant
  // (first instant already on the new offset) at minute resolution.
  let low = Math.floor((wallMs - MS_PER_DAY) / MS_PER_MINUTE)
  let high = Math.ceil((wallMs + MS_PER_DAY) / MS_PER_MINUTE)
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (offsetAt(timezone, mid * MS_PER_MINUTE) === offsetBefore) {
      low = mid
    } else {
      high = mid
    }
  }
  return high * MS_PER_MINUTE
}

function localDateOf(instant: Date, timezone: string): LocalDate {
  const [year, month, day] = formatInTimeZone(instant, timezone, "yyyy-MM-dd")
    .split("-")
    .map(Number)
  return { year, month, day }
}

function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

const dateKeyOf = (date: LocalDate): string =>
  `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`

/**
 * The intervals in force on one local date: that date's override (which may be
 * empty = closed) when there is one, else the weekly intervals of its weekday.
 */
const intervalsForDate = (
  date: LocalDate,
  weekly: ReadonlyMap<number, WorkingInterval[]>,
  dateOverrides: WorkingDateOverrides | undefined,
): readonly WorkingInterval[] | undefined => {
  const weekday = weekdayOf(date)
  const override = dateOverrides?.get(dateKeyOf(date))
  if (!override) {
    return weekly.get(weekday)
  }
  return [...override]
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((range) => ({ weekday, ...range }))
}

const weekdayOf = (date: LocalDate): number =>
  new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()

/**
 * Whether `at` falls inside the intervals in force on its local date in
 * `timezone` (a date override replaces the weekly intervals of that date;
 * `start <= minute < end`, 1440 covers the end of the local day). Pure; no
 * intervals means never "within".
 */
export function isWithinWorkingHours(props: {
  at: Date
  intervals: readonly WorkingInterval[]
  timezone: string
  dateOverrides?: WorkingDateOverrides
}): boolean {
  const { at, intervals, timezone, dateOverrides } = props
  if (!Number.isFinite(at.getTime())) {
    return false
  }
  const date = localDateOf(at, timezone)
  const weekly = groupByWeekday(intervals)
  const day = intervalsForDate(date, weekly, dateOverrides)
  if (!day || day.length === 0) {
    return false
  }
  const [hour, minute] = formatInTimeZone(at, timezone, "HH:mm")
    .split(":")
    .map(Number)
  const minuteOfDay = hour * 60 + minute
  return day.some(
    (interval) =>
      interval.startMinute <= minuteOfDay && minuteOfDay < interval.endMinute,
  )
}

const groupByWeekday = (
  intervals: readonly WorkingInterval[],
): Map<number, WorkingInterval[]> => {
  const byWeekday = new Map<number, WorkingInterval[]>()
  for (const interval of intervals) {
    byWeekday.set(interval.weekday, [
      ...(byWeekday.get(interval.weekday) ?? []),
      interval,
    ])
  }
  for (const [weekday, day] of byWeekday) {
    byWeekday.set(
      weekday,
      [...day].sort((a, b) => a.startMinute - b.startMinute),
    )
  }
  return byWeekday
}

/**
 * Seconds inside the working intervals between `from` and `to` (half-open),
 * stepping by local calendar date in `timezone`; a date override replaces the
 * weekly intervals of its date. Pure; no clamp. Intervals must not overlap
 * (validated at write time).
 */
export function workingSecondsBetween(props: {
  from: Date
  to: Date
  intervals: readonly WorkingInterval[]
  timezone: string
  dateOverrides?: WorkingDateOverrides
}): number {
  const { from, to, intervals, timezone, dateOverrides } = props
  const fromMs = from.getTime()
  const toMs = to.getTime()
  if (
    !(Number.isFinite(fromMs) && Number.isFinite(toMs)) ||
    toMs <= fromMs ||
    (intervals.length === 0 && !dateOverrides?.size)
  ) {
    return 0
  }

  const byWeekday = groupByWeekday(intervals)

  const lastDate = localDateOf(to, timezone)
  const lastKey = Date.UTC(lastDate.year, lastDate.month - 1, lastDate.day)
  let date = localDateOf(from, timezone)
  let totalMs = 0

  // Offsets sampled at whole-UTC-day boundaries, memoised for this call: a
  // local date's wall times fall within [day-1d, day+2d] of its wall-as-UTC
  // midnight, so when both ends share an offset no transition touches the day
  // and every interval is plain `wall - offset` arithmetic (no Intl per
  // interval). Days that differ take the exact DST-aware path.
  const offsets = new Map<number, number>()
  const sampledOffset = (instantMs: number): number => {
    let value = offsets.get(instantMs)
    if (value === undefined) {
      value = offsetAt(timezone, instantMs)
      offsets.set(instantMs, value)
    }
    return value
  }

  while (true) {
    const dayKey = Date.UTC(date.year, date.month - 1, date.day)
    if (dayKey > lastKey) {
      break
    }
    offsets.delete(dayKey - 2 * MS_PER_DAY)
    const day = intervalsForDate(date, byWeekday, dateOverrides)
    if (day) {
      const offsetBefore = sampledOffset(dayKey - MS_PER_DAY)
      const constantOffset =
        offsetBefore === sampledOffset(dayKey + 2 * MS_PER_DAY)
      const next = addDays(date, 1)
      for (const interval of day) {
        const start = constantOffset
          ? dayKey + interval.startMinute * MS_PER_MINUTE - offsetBefore
          : wallMinuteToInstant(date, interval.startMinute, timezone)
        let end: number
        if (constantOffset) {
          end = dayKey + interval.endMinute * MS_PER_MINUTE - offsetBefore
        } else if (interval.endMinute >= MINUTES_PER_DAY) {
          end = wallMinuteToInstant(next, 0, timezone)
        } else {
          end = wallMinuteToInstant(date, interval.endMinute, timezone)
        }
        const clippedStart = Math.max(start, fromMs)
        const clippedEnd = Math.min(end, toMs)
        if (clippedEnd > clippedStart) {
          totalMs += clippedEnd - clippedStart
        }
      }
    }
    date = addDays(date, 1)
  }
  // Floor, like the raw reply duration, so working seconds never exceed total.
  return Math.floor(totalMs / 1000)
}

/** Longest walk `addWorkingSeconds` makes before giving up on a deadline. */
export const MAX_WORKING_WALK_DAYS = 366

/**
 * The instant `seconds` of working time after `from`: walks the local dates in
 * `timezone` (date overrides replace the weekly intervals of their date) and
 * consumes each open range from the first instant at or after `from`. `null`
 * when the time is not reached within `maxDays` local dates (an empty
 * schedule, or a target longer than the calendar can supply). Pure.
 */
export function addWorkingSeconds(props: {
  from: Date
  seconds: number
  intervals: readonly WorkingInterval[]
  timezone: string
  dateOverrides?: WorkingDateOverrides
  maxDays?: number
}): Date | null {
  const {
    from,
    seconds,
    intervals,
    timezone,
    dateOverrides,
    maxDays = MAX_WORKING_WALK_DAYS,
  } = props
  const fromMs = from.getTime()
  if (!(Number.isFinite(fromMs) && Number.isFinite(seconds)) || seconds < 0) {
    return null
  }
  if (seconds === 0) {
    return new Date(fromMs)
  }
  if (intervals.length === 0 && !dateOverrides?.size) {
    return null
  }

  const weekly = groupByWeekday(intervals)
  let remainingMs = seconds * 1000
  let date = localDateOf(from, timezone)
  for (let walked = 0; walked <= maxDays; walked++) {
    const day = intervalsForDate(date, weekly, dateOverrides)
    const next = addDays(date, 1)
    for (const interval of day ?? []) {
      const startMs = wallMinuteToInstant(date, interval.startMinute, timezone)
      const endMs =
        interval.endMinute >= MINUTES_PER_DAY
          ? wallMinuteToInstant(next, 0, timezone)
          : wallMinuteToInstant(date, interval.endMinute, timezone)
      const usableStart = Math.max(startMs, fromMs)
      const available = endMs - usableStart
      if (available <= 0) {
        continue
      }
      if (available >= remainingMs) {
        return new Date(usableStart + remainingMs)
      }
      remainingMs -= available
    }
    date = next
  }
  return null
}
