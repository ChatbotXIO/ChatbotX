/**
 * Date custom fields are stored as the start of the picked calendar day in the
 * writer's zone (the editor sends its browser zone as `fieldValuesTimezone`),
 * as a UTC ISO string. Reading must project the instant back into that same
 * zone, otherwise users east of UTC see the previous day.
 */

/** The browser's IANA zone, which is also what writes anchor to. */
export const browserTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone

/** `YYYY-MM-DD` of `date` on the calendar of `timeZone`. */
export const dateKeyIn = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)

const MS_PER_MINUTE = 60_000
const DATETIME_LOCAL_LENGTH = 16

/** Instant -> the browser-local `YYYY-MM-DDTHH:mm` a datetime-local input shows ("" when unset/invalid). */
export function toDateTimeLocalInput(
  value: Date | string | null | undefined,
): string {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  return new Date(date.getTime() - date.getTimezoneOffset() * MS_PER_MINUTE)
    .toISOString()
    .slice(0, DATETIME_LOCAL_LENGTH)
}

const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/
const STORED_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/

/**
 * Stored date value -> `YYYY-MM-DD`. A value stored with an offset
 * (`2026-05-20T00:00:00+07:00`, what the editor's write produces) already
 * names its calendar day; a UTC (`Z`) instant is projected onto the calendar
 * of `timeZone`, so users east of UTC do not see the previous day.
 */
export function storedDateToDay(
  value: string,
  timeZone: string = browserTimeZone(),
): string {
  if (!value) {
    return ""
  }
  // A freshly picked day is already a calendar date; parsing it as a timestamp
  // would read it as UTC midnight and shift it in negative-offset zones.
  if (BARE_DAY.test(value) || STORED_WITH_OFFSET.test(value)) {
    return value.slice(0, 10)
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10)
  }
  return dateKeyIn(date, timeZone)
}

/** The write-side patch field: only sent when custom field values change. */
export const withFieldValuesTimezone = <T extends object>(
  patch: T,
): T & { fieldValuesTimezone?: string } =>
  "fieldValues" in patch
    ? { ...patch, fieldValuesTimezone: browserTimeZone() }
    : patch
