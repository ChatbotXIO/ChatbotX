import { addDays, addMinutes, addSeconds, format, parseISO } from "date-fns"
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz"

// ===========================================================================
// Constants & vocabulary
// ===========================================================================

export const DEFAULT_FILTER_TIMEZONE = "UTC"

/** Length of the `yyyy-MM-dd` prefix every stored temporal value starts with. */
export const DATE_PART_LENGTH = 10
export const DATE_FORMAT = "yyyy-MM-dd"
export const DATE_TIME_FORMAT = "yyyy-MM-dd HH:mm:ss"

export const temporalCustomFieldTypes = ["date", "datetime"] as const
export type TemporalCustomFieldType = (typeof temporalCustomFieldTypes)[number]

/**
 * How a write path parses raw temporal input before normalization.
 * - Strict: accept only canonical ISO (today's behavior; UI forms and APIs).
 * - Lenient: run the loose multi-format parser first (spreadsheet/import).
 */
export const TemporalInputParsing = {
  Strict: "strict",
  Lenient: "lenient",
} as const
export type TemporalInputParsing =
  (typeof TemporalInputParsing)[keyof typeof TemporalInputParsing]

/**
 * Which zone anchors a naive temporal value at write time.
 * - ContactThenWorkspace: contact zone, falling back to workspace (default).
 * - Workspace: workspace zone only; skips the contact lookup.
 */
export const SourceTimezoneStrategy = {
  ContactThenWorkspace: "contactThenWorkspace",
  Workspace: "workspace",
} as const
export type SourceTimezoneStrategy =
  (typeof SourceTimezoneStrategy)[keyof typeof SourceTimezoneStrategy]

// Private patterns & format strings shared by the helpers below.
const OFFSET_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_COMPONENT_PATTERN = /\d{2}:\d{2}/
const SECOND_COMPONENT_PATTERN = /\d{2}:\d{2}:\d{2}/
const FULL_TIME_LITERAL_PATTERN = /T\d{2}:\d{2}:\d{2}$/
const FRACTIONAL_SECONDS_PATTERN = /\.\d+$/
const ZONED_ISO_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX"
const NAIVE_DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss"

// ===========================================================================
// Reading a temporal string (pure inspection, no timezone)
// ===========================================================================

export const hasExplicitOffset = (value: string): boolean =>
  OFFSET_SUFFIX_PATTERN.test(value)

const offsetSuffixOf = (value: string): string =>
  OFFSET_SUFFIX_PATTERN.exec(value)?.[0] ?? ""

const toLocalIso = (value: string): string => value.replace(" ", "T")

export const datePartOf = (value: string): string =>
  value.slice(0, DATE_PART_LENGTH)

export const hasTimeComponent = (value: string): boolean =>
  TIME_COMPONENT_PATTERN.test(value.slice(DATE_PART_LENGTH))

/**
 * A temporal value's wall-clock literal with any timezone offset stripped, in a
 * form Postgres reads back with `::timestamp`. Date custom-field filters compare
 * wall clock to wall clock and must ignore a zone the user did not type:
 *   "2026-07-20"                -> "2026-07-20T00:00:00"
 *   "2026-07-20 09:30"          -> "2026-07-20T09:30"
 *   "2026-07-20T09:30:00+07:00" -> "2026-07-20T09:30:00"
 */
export const toNaiveWallClockLiteral = (value: string): string => {
  const local = toLocalIso(value.replace(OFFSET_SUFFIX_PATTERN, ""))
  return hasTimeComponent(local) ? local : `${datePartOf(local)}T00:00:00`
}

/**
 * True only for real calendar dates. Unlike `Date.parse`, which leniently rolls
 * `2026-02-30` forward into March and reports it valid, this rejects it —
 * matching the strictness of `fromZonedTime` and Postgres `::timestamp`. A value
 * that passes here therefore never throws in the converters below.
 */
export const isRealCalendarDate = (datePart: string): boolean => {
  const match = CALENDAR_DATE_PATTERN.exec(datePart)
  if (!match) {
    return false
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  )
}

const isValidDatetimeValue = (value: string): boolean =>
  (value.includes("T") || value.includes(" ")) &&
  isRealCalendarDate(datePartOf(value)) &&
  !Number.isNaN(Date.parse(toLocalIso(value)))

// ===========================================================================
// Timezone resolution & safe formatting
// ===========================================================================

export function resolveFilterTimezone(
  timezone: string | null | undefined,
): string {
  if (!timezone) {
    return DEFAULT_FILTER_TIMEZONE
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return timezone
  } catch {
    return DEFAULT_FILTER_TIMEZONE
  }
}

/**
 * `formatInTimeZone` that never throws. Every surface that renders a stored
 * temporal value — exports, variable interpolation, the contact detail panel —
 * shares this so a single bad row degrades one cell instead of failing the
 * whole render around it.
 */
export const formatWithFallback = (
  date: Date | string,
  timezone: string | null | undefined,
  pattern: string,
): string => {
  try {
    return formatInTimeZone(date, timezone ?? DEFAULT_FILTER_TIMEZONE, pattern)
  } catch {
    // An unresolvable timezone falls back to UTC; a corrupt stored value (e.g.
    // legacy garbage the migration skipped) would still throw, so degrade to
    // the raw string rather than crash the export/variable render around it.
    try {
      return formatInTimeZone(date, DEFAULT_FILTER_TIMEZONE, pattern)
    } catch {
      return typeof date === "string" ? date : ""
    }
  }
}

// ===========================================================================
// Value → UTC instant & day boundaries
// ===========================================================================

const normalizeValueWithExplicitOffset = (
  value: string,
  timezone: string,
  convert: (normalizedValue: string, normalizedTimezone: string) => string,
): string =>
  hasExplicitOffset(value)
    ? new Date(value).toISOString()
    : convert(value, timezone)

export function filterValueToUtcIso(value: string, timezone: string): string {
  return normalizeValueWithExplicitOffset(
    value,
    timezone,
    (normalizedValue, normalizedTimezone) =>
      fromZonedTime(
        toLocalIso(normalizedValue),
        normalizedTimezone,
      ).toISOString(),
  )
}

export function filterValueToUtcDayStartIso(
  value: string,
  timezone: string,
): string {
  return fromZonedTime(`${datePartOf(value)}T00:00:00`, timezone).toISOString()
}

export function filterValueToUtcDayEndIso(
  value: string,
  timezone: string,
): string {
  const nextDay = format(addDays(parseISO(datePartOf(value)), 1), DATE_FORMAT)
  return fromZonedTime(`${nextDay}T00:00:00`, timezone).toISOString()
}

export function toZonedDayStartIso(value: string, timezone: string): string {
  const safeTimezone = resolveFilterTimezone(timezone)
  const dayStart = fromZonedTime(`${datePartOf(value)}T00:00:00`, safeTimezone)
  return formatInTimeZone(dayStart, safeTimezone, ZONED_ISO_FORMAT)
}

/**
 * The same instant re-expressed as a wall clock in `timezone`: the returned
 * Date's *local* getters (`getHours`, `getDate`, …) read as the time there.
 *
 * Use it only to compare calendar/clock components — the returned Date no
 * longer names the original instant, so never store or serialize it. An
 * unusable zone degrades to UTC and an unparseable input is passed through as
 * an Invalid Date, so this never throws inside a shared sweep tick.
 */
export function toZonedWallClock(
  date: Date | string | number,
  timezone: string | null | undefined,
): Date {
  const instant = date instanceof Date ? date : new Date(date)
  return Number.isNaN(instant.getTime())
    ? instant
    : toZonedTime(instant, resolveFilterTimezone(timezone))
}

// ===========================================================================
// Precision windows (granularity-aware equality)
// ===========================================================================

/** The granularity a temporal filter value was typed at. */
export type TemporalPrecision = "day" | "minute" | "second"

/**
 * The precision the user actually typed, read off the value's own digits:
 *   "2026-07-22"          -> "day"     (no time part)
 *   "2026-07-22 09:30"    -> "minute"
 *   "2026-07-22 09:30:45" -> "second"
 * Equality then matches a window exactly one unit of this size, so a filter is
 * as precise as its input and no more — never the whole day when a time is typed.
 */
export const detectTemporalPrecision = (value: string): TemporalPrecision => {
  const timePart = value
    .replace(OFFSET_SUFFIX_PATTERN, "")
    .slice(DATE_PART_LENGTH)
  if (SECOND_COMPONENT_PATTERN.test(timePart)) {
    return "second"
  }
  if (TIME_COMPONENT_PATTERN.test(timePart)) {
    return "minute"
  }
  return "day"
}

/** The floored wall-clock literal, padded to a full `HH:mm:ss` and offset-free. */
const flooredNaiveLiteral = (value: string): string => {
  const naive = toNaiveWallClockLiteral(value).replace(
    FRACTIONAL_SECONDS_PATTERN,
    "",
  )
  return FULL_TIME_LITERAL_PATTERN.test(naive) ? naive : `${naive}:00`
}

const PRECISION_UNIT_ADDERS = {
  day: (date: Date) => addDays(date, 1),
  minute: (date: Date) => addMinutes(date, 1),
  second: (date: Date) => addSeconds(date, 1),
} as const satisfies Record<TemporalPrecision, (date: Date) => Date>

/**
 * The half-open wall-clock window `[start, end)` one typed value covers at its
 * own precision, as naive literals Postgres reads back with `::timestamp`:
 *   "2026-07-22 09:30" -> { start: "2026-07-22T09:30:00", end: "2026-07-22T09:31:00" }
 * The end is derived by adding one unit in UTC (which has no DST) and reading
 * the wall clock back, so the arithmetic never depends on the host timezone.
 */
export function temporalWallClockWindow(value: string): {
  start: string
  end: string
} {
  const start = flooredNaiveLiteral(value)
  const addUnit = PRECISION_UNIT_ADDERS[detectTemporalPrecision(value)]
  const end = formatInTimeZone(
    addUnit(fromZonedTime(start, DEFAULT_FILTER_TIMEZONE)),
    DEFAULT_FILTER_TIMEZONE,
    NAIVE_DATETIME_FORMAT,
  )
  return { start, end }
}

/**
 * The same precision window as an instant range `[startIso, endIso)` in UTC. A
 * naive value is anchored to `timezone`; a value carrying its own offset keeps
 * it. DST-safe: each naive edge is anchored independently, like the day-end
 * helper above.
 */
export function filterValueToUtcInstantWindow(
  value: string,
  timezone: string,
): { startIso: string; endIso: string } {
  const { start, end } = temporalWallClockWindow(value)
  const toInstant = hasExplicitOffset(value)
    ? (naive: string) =>
        new Date(`${naive}${offsetSuffixOf(value)}`).toISOString()
    : (naive: string) => fromZonedTime(naive, timezone).toISOString()
  return { startIso: toInstant(start), endIso: toInstant(end) }
}

// ===========================================================================
// Custom-field values — normalize, format, save
// ===========================================================================

const normalizeExplicitOffsetValue = (value: string): string | null => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

const normalizeValidatedTemporalValue = (input: {
  value: string
  timezone: string
  isValidLocalValue: (value: string) => boolean
  toUtcIso: (value: string, timezone: string) => string
}): string | null => {
  if (hasExplicitOffset(input.value)) {
    return normalizeExplicitOffsetValue(input.value)
  }

  return input.isValidLocalValue(input.value)
    ? input.toUtcIso(input.value, input.timezone)
    : null
}

const temporalCustomFieldNormalizationHandlers = {
  date: (value: string, timezone: string) => {
    const datePart = datePartOf(value)
    return isRealCalendarDate(datePart)
      ? toZonedDayStartIso(datePart, timezone)
      : null
  },
  datetime: (value: string, timezone: string) =>
    normalizeValidatedTemporalValue({
      value,
      timezone,
      isValidLocalValue: isValidDatetimeValue,
      toUtcIso: filterValueToUtcIso,
    }),
} as const satisfies Record<
  TemporalCustomFieldType,
  (value: string, timezone: string) => string | null
>

const temporalCustomFieldFormattingHandlers = {
  date: (value: string) => datePartOf(value),
  datetime: (value: string, timezone: string) =>
    formatWithFallback(value, timezone, DATE_TIME_FORMAT),
} as const satisfies Record<
  TemporalCustomFieldType,
  (value: string, timezone: string) => string
>

export const isTemporalCustomFieldType = (
  type: string,
): type is TemporalCustomFieldType =>
  type in temporalCustomFieldFormattingHandlers

export function normalizeTemporalCustomFieldValue(
  type: string,
  value: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!(value && isTemporalCustomFieldType(type))) {
    return null
  }

  return temporalCustomFieldNormalizationHandlers[type](
    value,
    resolveFilterTimezone(timezone),
  )
}

export function formatCustomFieldValueInTimeZone(
  type: string,
  value: string | null | undefined,
  timezone: string,
): string {
  if (!value) {
    return ""
  }

  if (!isTemporalCustomFieldType(type)) {
    return value
  }

  return temporalCustomFieldFormattingHandlers[type](value, timezone)
}

export function resolveTemporalCustomFieldFormValue(
  type: string,
  value: string,
): string {
  return type === "date" ? datePartOf(value) : value
}

export type TemporalCustomFieldSaveFormat = "formatted" | "iso"

const TEMPORAL_CUSTOM_FIELD_SAVE_FORMATS = {
  date: "formatted",
  datetime: "iso",
} as const satisfies Record<
  TemporalCustomFieldType,
  TemporalCustomFieldSaveFormat
>

export function resolveTemporalCustomFieldSaveFormat(
  type: string,
): TemporalCustomFieldSaveFormat {
  return isTemporalCustomFieldType(type)
    ? TEMPORAL_CUSTOM_FIELD_SAVE_FORMATS[type]
    : "formatted"
}

/** The naive literal each temporal type uses to represent "now". */
const TEMPORAL_NOW_LITERAL_FORMATS = {
  date: DATE_FORMAT,
  datetime: DATE_TIME_FORMAT,
} as const satisfies Record<TemporalCustomFieldType, string>

/**
 * The current moment rendered as the naive literal a given temporal type would
 * store: a `date` becomes today's calendar day in `timezone` (`yyyy-MM-dd`), a
 * `datetime` becomes the wall clock there (`yyyy-MM-dd HH:mm:ss`). Feed the
 * result back through the normalization handlers to reach the stored form.
 *
 * Used when a flow "set custom field" step leaves the value blank and should
 * stamp the current moment in the author's zone, so the empty->now path yields
 * storage byte-identical to a user typing that same literal.
 */
export function currentTemporalLiteral(
  type: TemporalCustomFieldType,
  timezone: string | null | undefined,
  now: Date = new Date(),
): string {
  return formatInTimeZone(
    now,
    resolveFilterTimezone(timezone),
    TEMPORAL_NOW_LITERAL_FORMATS[type],
  )
}
