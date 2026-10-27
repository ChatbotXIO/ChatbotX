import { PaymentProviderError } from "./errors"

/** Stripe's zero-decimal currencies: the amount is sent as is. */
const STRIPE_ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
])

/** Three decimals, and Stripe only takes amounts whose last digit is 0. */
const STRIPE_THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"])

/**
 * Zero-decimal currencies Stripe still takes as two decimals, always `00`
 * (5 ISK is `500`): whole units only.
 */
const STRIPE_WHOLE_UNITS_AS_TWO_DECIMAL = new Set(["ISK", "UGX"])

/** PayPal's zero-digit currencies: "no decimal places or fractions". */
const PAYPAL_ZERO_DECIMAL = new Set(["HUF", "JPY", "TWD"])

/**
 * The currencies PayPal takes payments in
 * (developer.paypal.com/reference/currency-codes). BRL, CNY and MYR work
 * only for an account in that country; PayPal refuses them otherwise.
 */
export const PAYPAL_SUPPORTED_CURRENCIES: readonly string[] = [
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "ILS",
  "JPY",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "SEK",
  "SGD",
  "THB",
  "TWD",
  "USD",
]

export const isPaypalCurrency = (currency: string): boolean =>
  PAYPAL_SUPPORTED_CURRENCIES.includes(currency.toUpperCase())

/** Amounts are numeric(19,4) in major units; anything finer is float noise. */
const EPSILON = 1e-6

const unsupported = (amount: number, currency: string) =>
  new PaymentProviderError(
    "amountUnsupported",
    `${amount} ${currency} cannot be charged exactly in this currency.`,
    { providerCode: "amount_not_representable" },
  )

/**
 * `amount` × 10^`digits`, only when that is a whole number: an amount with
 * more decimals than the provider takes is refused, never rounded, so the
 * customer is charged exactly the order total.
 */
const scaleExactly = (amount: number, digits: number, currency: string) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw unsupported(amount, currency)
  }
  const scaled = amount * 10 ** digits
  const minor = Math.round(scaled)
  if (Math.abs(scaled - minor) > EPSILON || !Number.isSafeInteger(minor)) {
    throw unsupported(amount, currency)
  }
  return minor
}

export const toStripeMinorUnits = (
  amount: number,
  currency: string,
): number => {
  const code = currency.toUpperCase()
  if (STRIPE_ZERO_DECIMAL.has(code)) {
    return scaleExactly(amount, 0, code)
  }
  if (STRIPE_WHOLE_UNITS_AS_TWO_DECIMAL.has(code)) {
    return scaleExactly(amount, 0, code) * 100
  }
  if (STRIPE_THREE_DECIMAL.has(code)) {
    const minor = scaleExactly(amount, 3, code)
    if (minor % 10 !== 0) {
      throw unsupported(amount, code)
    }
    return minor
  }
  return scaleExactly(amount, 2, code)
}

const paypalDigits = (currency: string) =>
  PAYPAL_ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2

export const toPaypalMinorUnits = (
  amount: number,
  currency: string,
): number => {
  const code = currency.toUpperCase()
  if (!isPaypalCurrency(code)) {
    throw new PaymentProviderError(
      "amountUnsupported",
      `PayPal does not take payments in ${code}.`,
      { providerCode: "currency_not_supported" },
    )
  }
  return scaleExactly(amount, paypalDigits(code), code)
}

/** PayPal's `value` string for minor units: `1250` USD is `"12.50"`. */
export const formatPaypalValue = (minor: number, currency: string): string => {
  const digits = paypalDigits(currency)
  if (digits === 0) {
    return String(minor)
  }
  const whole = Math.floor(minor / 100)
  const cents = String(minor % 100).padStart(2, "0")
  return `${whole}.${cents}`
}

const PAYPAL_VALUE_PATTERN = /^(\d+)(?:\.(\d+))?$/
const NON_ZERO_DIGIT_PATTERN = /[^0]/

/** PayPal's `value` string back to minor units, exactly (no floats). */
export const parsePaypalValue = (value: string, currency: string): number => {
  const match = PAYPAL_VALUE_PATTERN.exec(value.trim())
  if (!match) {
    throw new PaymentProviderError(
      "invalidRequest",
      `PayPal sent an amount that is not a number: ${value}.`,
    )
  }
  const digits = paypalDigits(currency)
  const fraction = (match[2] ?? "").padEnd(digits, "0")
  if (
    fraction.length > digits &&
    NON_ZERO_DIGIT_PATTERN.test(fraction.slice(digits))
  ) {
    throw new PaymentProviderError(
      "invalidRequest",
      `PayPal sent more decimals than ${currency} has: ${value}.`,
    )
  }
  return Number(`${match[1]}${fraction.slice(0, digits)}`)
}
