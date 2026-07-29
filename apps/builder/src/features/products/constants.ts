/** ISO 4217 code a product falls back to when none was picked. */
export const DEFAULT_PRODUCT_CURRENCY = "USD"

/**
 * Currencies offered in the product form. Meta Catalog accepts any ISO 4217
 * code, so this is a shortlist for the picker — not a validation whitelist.
 */
export const PRODUCT_CURRENCIES: readonly string[] = [
  "USD",
  "VND",
  "EUR",
  "GBP",
  "SGD",
  "THB",
  "MYR",
  "IDR",
  "PHP",
  "JPY",
  "KRW",
  "CNY",
  "INR",
  "AUD",
  "CAD",
]

/** Money is fractional; react-number-format is integer-only by default. */
const PRICE_DECIMAL_SCALE = 2

/**
 * Both separators are accepted so a comma-decimal locale (vi-VN) and a
 * dot-decimal one (en-US) can type the same field and land on the same number.
 */
const PRICE_DECIMAL_SEPARATORS: string[] = [".", ","]

export const PRICE_INPUT_PROPS = {
  allowedDecimalSeparators: PRICE_DECIMAL_SEPARATORS,
  decimalScale: PRICE_DECIMAL_SCALE,
}
