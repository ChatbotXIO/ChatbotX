/** Currencies listed before the rest collapse into "+N more". */
export const MAX_CURRENCIES_SHOWN = 5

export const formatCount = (locale: string, value: number): string =>
  new Intl.NumberFormat(locale).format(value)

export const formatPercent = (locale: string, rate: number): string =>
  new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(rate)

/** `value` is an exact decimal string, passed to Intl as is so large totals keep every digit; an unknown currency code falls back to "value CODE" instead of throwing. */
export const formatCurrencyValue = (
  locale: string,
  value: string,
  currency: string,
): string => {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(value as Intl.StringNumericLiteral)
  } catch {
    return `${value} ${currency}`
  }
}

/** "YYYY-MM-DD" is already a day in the range timezone, so it is formatted as that calendar day (UTC) and never shifted. */
export const formatDayKey = (locale: string, dayKey: string): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dayKey}T00:00:00Z`))

export const splitShown = <T>(
  items: readonly T[],
  max: number,
): { shown: T[]; hidden: T[] } => ({
  shown: items.slice(0, max),
  hidden: items.slice(max),
})
