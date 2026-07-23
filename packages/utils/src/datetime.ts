import { addDays, format, parseISO } from "date-fns"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

export const DEFAULT_FILTER_TIMEZONE = "UTC"
export const temporalCustomFieldTypes = ["date", "datetime"] as const
export type TemporalCustomFieldType = (typeof temporalCustomFieldTypes)[number]

const OFFSET_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_COMPONENT_PATTERN = /\d{2}:\d{2}/
const DATE_PART_LENGTH = 10
const DATE_FORMAT = "yyyy-MM-dd"
const DATE_TIME_FORMAT = "yyyy-MM-dd HH:mm:ss"
const ZONED_ISO_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX"

export const hasExplicitOffset = (value: string): boolean =>
  OFFSET_SUFFIX_PATTERN.test(value)

const toLocalIso = (value: string): string => value.replace(" ", "T")

export const datePartOf = (value: string): string =>
  value.slice(0, DATE_PART_LENGTH)

export const hasTimeComponent = (value: string): boolean =>
  TIME_COMPONENT_PATTERN.test(value.slice(DATE_PART_LENGTH))

const normalizeExplicitOffsetValue = (value: string): string | null => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

const normalizeValueWithExplicitOffset = (
  value: string,
  timezone: string,
  convert: (normalizedValue: string, normalizedTimezone: string) => string,
): string =>
  hasExplicitOffset(value)
    ? new Date(value).toISOString()
    : convert(value, timezone)

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

const formatWithFallback = (
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

const temporalCustomFieldFormattingHandlers = {
  date: (value: string) => datePartOf(value),
  datetime: (value: string, timezone: string) =>
    formatWithFallback(value, timezone, DATE_TIME_FORMAT),
} as const satisfies Record<
  TemporalCustomFieldType,
  (value: string, timezone: string) => string
>

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

export function resolveTemporalCustomFieldFormValue(
  type: string,
  value: string,
): string {
  return type === "date" ? datePartOf(value) : value
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
