import { formatInTimeZone } from "date-fns-tz"
import { normalizeTemporalCustomFieldValue } from "../datetime"
import { localDateOf, resolveZonedInstant } from "../recurrence"
import { parseLooseTemporalValue } from "../temporal-input"

/**
 * Free-form date arithmetic: `<base> ( <ws> (+|-) <ws>? <int> <ws>? <unit> )*`,
 * e.g. `now + 2 days - 3h`. The required whitespace before an operator keeps
 * the `-` and `+offset` of an ISO base intact.
 */

export type DateUnit = "minute" | "hour" | "day" | "week" | "month" | "year"

export const DATE_EXPRESSION_LIMITS = {
  maxTerms: 10,
  maxMagnitude: 100_000,
} as const

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const MIN_YEAR = 1
const MAX_YEAR = 9999
const MINUTE_PRECISION_PATTERN = "yyyy-MM-dd'T'HH:mm"

type DateClock = { now: Date; timeZone: string }

const isRepresentable = (date: Date): boolean => {
  const year = date.getUTCFullYear()
  return !Number.isNaN(date.getTime()) && year >= MIN_YEAR && year <= MAX_YEAR
}

/**
 * Moves the wall clock (not the instant) by whole days/months, so a day is a
 * calendar day across a DST change. Month-end is clamped (Jan 31 + 1 month =
 * Feb 28/29), and a nonexistent local time resolves like the rest of the
 * product (`resolveZonedInstant`).
 */
const addWallClock = (
  base: Date,
  timeZone: string,
  shift: { days?: number; months?: number },
): Date | null => {
  const [localDate, localTime] = formatInTimeZone(
    base,
    timeZone,
    MINUTE_PRECISION_PATTERN,
  ).split("T") as [string, string]
  const [year, month, day] = localDate.split("-").map(Number) as [
    number,
    number,
    number,
  ]
  const firstOfMonth = new Date(
    Date.UTC(year, month - 1 + (shift.months ?? 0), 1),
  )
  const daysInMonth = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const shifted = new Date(
    Date.UTC(
      firstOfMonth.getUTCFullYear(),
      firstOfMonth.getUTCMonth(),
      Math.min(day, daysInMonth) + (shift.days ?? 0),
    ),
  )
  if (!isRepresentable(shifted)) {
    return null
  }
  const subMinuteMs =
    base.getTime() - Math.floor(base.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE
  const resolved = resolveZonedInstant(
    shifted.toISOString().slice(0, 10),
    localTime,
    timeZone,
  )
  return new Date(resolved.getTime() + subMinuteMs)
}

type UnitAdder = (base: Date, amount: number, timeZone: string) => Date | null

/** Minutes and hours are absolute instants; the rest are wall-clock moves. */
const UNIT_ADDERS = {
  minute: (base, amount) =>
    new Date(base.getTime() + Math.round(amount * MS_PER_MINUTE)),
  hour: (base, amount) =>
    new Date(base.getTime() + Math.round(amount * MS_PER_HOUR)),
  day: (base, amount, timeZone) =>
    addWallClock(base, timeZone, { days: amount }),
  week: (base, amount, timeZone) =>
    addWallClock(base, timeZone, { days: amount * 7 }),
  month: (base, amount, timeZone) =>
    addWallClock(base, timeZone, { months: amount }),
  year: (base, amount, timeZone) =>
    addWallClock(base, timeZone, { months: amount * 12 }),
} as const satisfies Record<DateUnit, UnitAdder>

/** The result, or null when it falls outside the representable years. */
export const addDateUnit = (
  base: Date,
  unit: DateUnit,
  amount: number,
  timeZone: string,
): Date | null => {
  const result = UNIT_ADDERS[unit](base, amount, timeZone)
  return result && isRepresentable(result) ? result : null
}

const UNIT_BY_ALIAS = new Map<string, DateUnit>([
  ...["min", "minute", "minutes"].map((alias) => [alias, "minute"] as const),
  ...["h", "hour", "hours"].map((alias) => [alias, "hour"] as const),
  ...["d", "day", "days"].map((alias) => [alias, "day"] as const),
  ...["w", "week", "weeks"].map((alias) => [alias, "week"] as const),
  ...["mo", "month", "months"].map((alias) => [alias, "month"] as const),
  ...["y", "year", "years"].map((alias) => [alias, "year"] as const),
])

const BASE_TOKEN_PATTERN = /^\S+/
const TERM_PATTERN = /\s+([+-])\s*(\d+)\s*([a-z]+)/iy

const resolveBase = (token: string, clock: DateClock): Date | null => {
  const keyword = token.toLowerCase()
  if (keyword === "now") {
    return clock.now
  }
  if (keyword === "today") {
    return resolveZonedInstant(
      localDateOf(clock.now, clock.timeZone),
      "00:00",
      clock.timeZone,
    )
  }
  const stored =
    normalizeTemporalCustomFieldValue("datetime", token, clock.timeZone) ??
    normalizeTemporalCustomFieldValue(
      "datetime",
      parseLooseTemporalValue("datetime", token, clock.timeZone, clock.now),
      clock.timeZone,
    )
  return stored === null ? null : new Date(stored)
}

/** The instant the expression names, or null when it is not valid. */
export const evaluateDateExpression = (
  expression: string,
  clock: DateClock,
): Date | null => {
  const source = expression.trim()
  const baseToken = BASE_TOKEN_PATTERN.exec(source)?.[0]
  if (!baseToken) {
    return null
  }
  let result = resolveBase(baseToken, clock)
  TERM_PATTERN.lastIndex = baseToken.length
  let terms = 0
  while (result && TERM_PATTERN.lastIndex < source.length) {
    const match = TERM_PATTERN.exec(source)
    const unit = match
      ? UNIT_BY_ALIAS.get((match[3] as string).toLowerCase())
      : undefined
    const magnitude = Number(match?.[2])
    if (
      !(match && unit) ||
      magnitude > DATE_EXPRESSION_LIMITS.maxMagnitude ||
      ++terms > DATE_EXPRESSION_LIMITS.maxTerms
    ) {
      return null
    }
    result = addDateUnit(
      result,
      unit,
      match[1] === "-" ? -magnitude : magnitude,
      clock.timeZone,
    )
  }
  return result
}
