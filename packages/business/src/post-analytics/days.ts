import { formatInTimeZone } from "date-fns-tz"

const DAY_MS = 86_400_000
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Most days a read may span. */
export const POST_ANALYTICS_MAX_RANGE_DAYS = 366
/** Days a read spans when the caller gives no range. */
export const POST_ANALYTICS_DEFAULT_RANGE_DAYS = 30

const toUtc = (day: string): number => Date.parse(`${day}T00:00:00Z`)
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export const isDayString = (value: string): boolean =>
  DAY_PATTERN.test(value) && fromUtc(toUtc(value)) === value

/** `day` moved by `delta` days (calendar arithmetic on local dates, so DST never shifts it). */
export const addDays = (day: string, delta: number): string =>
  fromUtc(toUtc(day) + delta * DAY_MS)

/** Days in the inclusive range. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1

/** Every day of the inclusive range. */
export const eachDay = (from: string, to: string): string[] =>
  Array.from({ length: daysBetween(from, to) }, (_, index) =>
    addDays(from, index),
  )

/** The workspace-local date of an instant. */
export const localDay = (at: Date, timezone: string): string =>
  formatInTimeZone(at, timezone, "yyyy-MM-dd")
