import { datePartOf, isRealCalendarDate } from "./datetime"

/**
 * Lives here (not `@chatbotx.io/database`) so a "use client" component (e.g.
 * the contact-filter condition dialog) can validate a filter value without
 * depending on the database's query layer. `@chatbotx.io/database`'s
 * contact-filter query module re-exports this for existing backend
 * importers. Mirrors the `channelTypes` precedent in `./channel.ts`.
 */
export const NUMERIC_VALUE_PATTERN = /^-?\d+(\.\d+)?$/

export const DATETIME_VALUE_PATTERN =
  "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])([T ]([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d(\\.\\d{1,6})?)?(Z|[+-]([01]\\d|2[0-3]):?[0-5]\\d)?)?$"

const DATETIME_VALUE_RE = new RegExp(DATETIME_VALUE_PATTERN)

// The regex accepts day 01-31 for every month, so "2026-02-30" slips through and
// Date.parse leniently rolls it to March — but the ::timestamptz cast this feeds
// is strict and throws. Reject non-real calendar dates before they reach SQL.
export const isValidDateTimeFilterValue = (value: string): boolean =>
  DATETIME_VALUE_RE.test(value) &&
  isRealCalendarDate(datePartOf(value)) &&
  !Number.isNaN(Date.parse(value))

export const valueContainsVariablePlaceholder = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === "string") {
    return value.includes("{{")
  }
  if (Array.isArray(value)) {
    return value.some(valueContainsVariablePlaceholder)
  }
  return false
}
