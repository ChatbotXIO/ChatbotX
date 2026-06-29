import { differenceInDays } from "date-fns"

type DateInput = Date | string | number | null | undefined

function toValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatShortDate(value: DateInput, locale: string): string {
  const date = toValidDate(value)
  if (!date) {
    return ""
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(date)
}

export function formatDateWithYear(value: DateInput, locale: string): string {
  const date = toValidDate(value)
  if (!date) {
    return ""
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

export function formatTimeRangeDate(
  value: DateInput,
  fromValue: DateInput,
  toValue: DateInput,
  locale: string,
): string {
  const date = toValidDate(value)
  if (!date) {
    return ""
  }

  const from = toValidDate(fromValue)
  const to = toValidDate(toValue)

  if (from && to && differenceInDays(to, from) > 60) {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric",
    }).format(date)
  }

  return formatShortDate(date, locale)
}
