import { addDays, format, parseISO } from "date-fns"
import { fromZonedTime } from "date-fns-tz"

/**
 * Timezone handling for date/datetime filter values.
 *
 * Contact-filter date values arrive as *naive* wall-clock strings (the UI sends
 * no offset — see the free-text `YYYY-MM-DD HH:mm` input). "created on
 * 2026-07-20" is inherently a timezone-relative question, so a naive value is
 * interpreted in the caller-supplied timezone (the browser's local zone,
 * captured at build/save time) and converted to an absolute UTC instant here in
 * JS. The generated SQL then compares the (already-UTC) `timestamptz` columns
 * against plain UTC-instant literals — no per-row `date_trunc`/`AT TIME ZONE`,
 * so the column stays index-friendly.
 *
 * A value that already carries an explicit offset/`Z` is an absolute instant and
 * is used verbatim (no re-interpretation).
 */

export const DEFAULT_FILTER_TIMEZONE = "UTC"

const OFFSET_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/
const DATE_PART_LENGTH = 10 // "YYYY-MM-DD"

/**
 * Validate an IANA timezone name, falling back to UTC when absent or
 * unrecognized. Guards against an invalid zone reaching `Intl`/date-fns-tz and
 * throwing at query-build time.
 */
export function resolveFilterTimezone(
  timezone: string | null | undefined,
): string {
  if (!timezone) {
    return DEFAULT_FILTER_TIMEZONE
  }
  try {
    // Throws RangeError for an unknown IANA zone.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return timezone
  } catch {
    return DEFAULT_FILTER_TIMEZONE
  }
}

const hasExplicitOffset = (value: string): boolean =>
  OFFSET_SUFFIX_PATTERN.test(value)

// date-fns-tz expects the "T" separator; the UI may send a space.
const toLocalIso = (value: string): string => value.replace(" ", "T")

const datePartOf = (value: string): string => value.slice(0, DATE_PART_LENGTH)

/**
 * The absolute UTC instant (ISO string) of a filter value: interpreted in
 * `timezone` when naive, or used as-is when it already carries an offset.
 */
export function filterValueToUtcIso(value: string, timezone: string): string {
  if (hasExplicitOffset(value)) {
    return new Date(value).toISOString()
  }
  return fromZonedTime(toLocalIso(value), timezone).toISOString()
}

/**
 * Start of the calendar day of `value` (midnight in `timezone`) as a UTC
 * instant — the inclusive lower bound for day-based equality.
 */
export function filterValueToUtcDayStartIso(
  value: string,
  timezone: string,
): string {
  return fromZonedTime(`${datePartOf(value)}T00:00:00`, timezone).toISOString()
}

/**
 * Start of the day *after* the calendar day of `value` (next midnight in
 * `timezone`) as a UTC instant — the exclusive upper bound for day-based
 * equality. Computed from the next calendar date (not `+24h`) so it stays
 * correct across DST transitions.
 */
export function filterValueToUtcDayEndIso(
  value: string,
  timezone: string,
): string {
  const nextDay = format(addDays(parseISO(datePartOf(value)), 1), "yyyy-MM-dd")
  return fromZonedTime(`${nextDay}T00:00:00`, timezone).toISOString()
}
