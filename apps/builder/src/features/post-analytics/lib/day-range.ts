import { endOfDay, format, startOfDay, subDays } from "date-fns"

const DAY_FORMAT = "yyyy-MM-dd"
/** The read accepts at most this many days. */
export const MAX_RANGE_DAYS = 366

export const toDayKey = (date: Date): string => format(date, DAY_FORMAT)

/** A `YYYY-MM-DD` day as a local date at the start of that day; `undefined` if it is not one. */
export const fromDayKey = (key: string | null): Date | undefined => {
  if (!key) {
    return
  }
  const parsed = new Date(`${key}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? undefined : startOfDay(parsed)
}

/**
 * The range a filter pick sends: the days are written as local calendar days,
 * the end is not after `today`, and the span is cut to `MAX_RANGE_DAYS`.
 * `today` is the WORKSPACE's current day (`YYYY-MM-DD`, from the summary
 * response); the browser's own day is only the fallback while it is unknown.
 */
export const clampRange = (
  range: { from: Date; to: Date },
  today: string | Date = new Date(),
): { from: string; to: string } => {
  const todayDate =
    typeof today === "string" ? (fromDayKey(today) ?? new Date()) : today
  const to = range.to > endOfDay(todayDate) ? todayDate : range.to
  const earliest = subDays(to, MAX_RANGE_DAYS - 1)
  const from = range.from < earliest ? earliest : range.from
  return { from: toDayKey(from), to: toDayKey(to) }
}

/** The default span of the filter, in days, when neither the URL nor the server gave a range. */
const DEFAULT_RANGE_DAYS = 30

/**
 * The range the date filter shows. It exists only once the summary has told the
 * workspace's current day (`today`, `YYYY-MM-DD`): before that it is `null`,
 * because the browser's own day can differ from the workspace's. The URL's
 * days win; then the server-resolved range; then the default span ending today.
 */
export const resolveFilterRange = (input: {
  from: string | null
  resolved?: { range: { from: string; to: string }; today: string }
  to: string | null
}): { from: Date; to: Date } | null => {
  const today = fromDayKey(input.resolved?.today ?? null)
  if (!(today && input.resolved)) {
    return null
  }
  const from =
    fromDayKey(input.from) ??
    fromDayKey(input.resolved.range.from) ??
    startOfDay(subDays(today, DEFAULT_RANGE_DAYS - 1))
  const to =
    fromDayKey(input.to) ?? fromDayKey(input.resolved.range.to) ?? today
  return { from, to: endOfDay(to) }
}
