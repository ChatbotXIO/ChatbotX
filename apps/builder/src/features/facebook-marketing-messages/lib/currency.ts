/**
 * Meta's ad-account currency offsets
 * (developers.facebook.com/documentation/ads-commerce/marketing-api/currencies).
 * The default offset is 100; these eleven currencies use 1.
 *
 * This is deliberately Meta's list, NOT ISO 4217 — `TWD` has two decimals in
 * ISO but offset 1 at Meta, so a generic ISO helper would overcharge by 100x.
 */
export const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  "CLP",
  "COP",
  "CRC",
  "HUF",
  "IDR",
  "ISK",
  "JPY",
  "KRW",
  "PYG",
  "TWD",
  "VND",
])

const DEFAULT_OFFSET = 100

export function currencyOffset(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
    ? 1
    : DEFAULT_OFFSET
}

/** Major units as typed by the user -> the integer amount Meta expects. */
export function toMinorUnits(major: number, currency: string): number {
  return Math.round(major * currencyOffset(currency))
}

/**
 * The stored integer -> the major units shown to the user. Takes the offset
 * snapshotted on the row rather than recomputing it from the currency, so a
 * historical amount keeps rendering as it was actually charged.
 */
export function toMajorUnits(minor: number, offset: number): number {
  return minor / offset
}

/**
 * The smallest positive amount the user can type. This expresses the
 * "budget must be > 0" rule in the currency's own units — it is NOT Meta's
 * per-currency minimum budget, which is enforced by Meta on save.
 */
export function minBudgetMajorUnits(currency: string): number {
  return 1 / currencyOffset(currency)
}
