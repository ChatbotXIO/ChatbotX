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

const weekdayOf = (date: LocalDate): number =>
  new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()

/**
 * Seconds inside the weekly intervals between `from` and `to` (half-open),
 * stepping by local calendar date in `timezone`. Pure; no clamp.
 * Intervals must not overlap (validated at write time).
 */
export function workingSecondsBetween(props: {
  from: Date
  to: Date
  intervals: readonly WorkingInterval[]
  timezone: string
}): number {
  const { from, to, intervals, timezone } = props
  const fromMs = from.getTime()
  const toMs = to.getTime()
  if (
    !(Number.isFinite(fromMs) && Number.isFinite(toMs)) ||
    toMs <= fromMs ||
    intervals.length === 0
  ) {
    return 0
  }

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
    const day = byWeekday.get(weekdayOf(date))
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
