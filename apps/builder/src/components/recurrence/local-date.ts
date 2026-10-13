import { format } from "date-fns"
import type { useFormatter } from "next-intl"

type Formatter = ReturnType<typeof useFormatter>

const parts = (value: string): [number, number, number] => {
  const [year, month, day] = value.split("-").map(Number)
  return [year, month, day]
}

/** `YYYY-MM-DD` → a Date at the browser's LOCAL midnight, which is what the day picker selects. */
export const toPickerDate = (value: string): Date => {
  const [year, month, day] = parts(value)
  return new Date(year, month - 1, day)
}

/**
 * Words for a `YYYY-MM-DD`. A calendar date has no zone, so it is read as UTC
 * midnight and formatted as UTC: formatting a local-midnight Date in the
 * configured zone would show the previous day whenever that zone is behind the
 * browser's.
 */
export const formatLocalDate = (
  formatter: Formatter,
  value: string,
): string => {
  const [year, month, day] = parts(value)
  return formatter.dateTime(new Date(Date.UTC(year, month - 1, day)), {
    dateStyle: "medium",
    timeZone: "UTC",
  })
}

const LOCAL_DATE_PATTERN = "yyyy-MM-dd"

/** A day picker's local-midnight Date → the `YYYY-MM-DD` a rule stores (the inverse of `toPickerDate`). */
export const toLocalDateString = (date: Date): string =>
  format(date, LOCAL_DATE_PATTERN)

/** How a run's date and time read in lists (weekday, date, time); add `timeZone` at the call site. */
export const RUN_WHEN_FORMAT = {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const
