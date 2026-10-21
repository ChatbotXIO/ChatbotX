import { ZERO_DECIMAL_CURRENCIES } from "./currency"

/** Missing metric (Meta returned nothing) — never shown as 0. */
const EMPTY = "-"

export function formatStatCount(value: number | null, locale: string): string {
  if (value === null) {
    return EMPTY
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    value,
  )
}

/** Meta returns rates as percentages with ~6 decimals (24.766355). */
export function formatStatRate(value: number | null, locale: string): string {
  if (value === null) {
    return EMPTY
  }
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value)
  return `${number}%`
}

/** Insights money is in major units of the ad account currency. */
export function formatStatMoney(
  value: number | null,
  currency: string | null,
  locale: string,
): string {
  if (value === null) {
    return EMPTY
  }
  if (!currency) {
    return new Intl.NumberFormat(locale).format(value)
  }
  const digits = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  } catch {
    // An unknown currency code must not blank the cell.
    return `${new Intl.NumberFormat(locale).format(value)} ${currency}`
  }
}
