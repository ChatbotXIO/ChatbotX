/**
 * Every order amount is computed here, so a cart total, an order total and the
 * catalog price shown to a customer can never disagree by a rounding cent.
 * Amounts stay in major units (`12.5` USD), the same unit `Product.price`, the
 * WhatsApp cart and Meta Catalog already use.
 */

const DEFAULT_FRACTION_DIGITS = 2

const fractionDigitsCache = new Map<string, number>()

/** How many decimals a currency has: 0 for JPY, 2 for USD, 3 for KWD. */
export const getCurrencyFractionDigits = (currency: string): number => {
  const code = currency.trim().toUpperCase()
  const cached = fractionDigitsCache.get(code)
  if (cached !== undefined) {
    return cached
  }
  let digits = DEFAULT_FRACTION_DIGITS
  try {
    digits =
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
      }).resolvedOptions().maximumFractionDigits ?? DEFAULT_FRACTION_DIGITS
  } catch {
    // An unknown code is not worth failing an order over: two decimals is what
    // nearly every currency uses.
  }
  fractionDigitsCache.set(code, digits)
  return digits
}

/** Rounds half away from zero to the currency's smallest unit. */
export const roundMoney = (amount: number, currency: string): number => {
  const factor = 10 ** getCurrencyFractionDigits(currency)
  const scaled = Math.abs(amount) * factor
  // `1.005 * 100` is `100.49999…` in binary; nudging by an epsilon scaled to
  // the value keeps a written-down half from rounding the wrong way.
  const rounded = Math.round(scaled + scaled * Number.EPSILON) / factor
  return amount < 0 ? -rounded : rounded
}

export const sumMoney = (amounts: number[], currency: string): number =>
  roundMoney(
    amounts.reduce((total, amount) => total + amount, 0),
    currency,
  )

/** `percent` of `amount`, rounded. Percentages are 0–100, as on `Product`. */
export const percentOf = (
  amount: number,
  percent: number,
  currency: string,
): number => roundMoney((amount * percent) / 100, currency)

export type LinePriceInput = {
  unitPrice: number
  quantity: number
  /** 0–100, as stored on `Product.discount`. */
  discountPercent?: number
  /** 0–100, as stored on `Product.taxes`. Applied after the discount. */
  taxPercent?: number
  currency: string
}

export type LinePrice = {
  /** `unitPrice × quantity`, before discount and tax. */
  gross: number
  discountTotal: number
  taxTotal: number
  /** What the customer pays for the line: gross − discount + tax. */
  lineTotal: number
}

/**
 * One line of an order. Each part is rounded once, here, so the order totals
 * are plain sums of already-rounded lines and never pick up a stray cent.
 */
export const computeLinePrice = (input: LinePriceInput): LinePrice => {
  const gross = roundMoney(input.unitPrice * input.quantity, input.currency)
  const discountTotal = percentOf(
    gross,
    input.discountPercent ?? 0,
    input.currency,
  )
  const taxTotal = percentOf(
    gross - discountTotal,
    input.taxPercent ?? 0,
    input.currency,
  )
  return {
    gross,
    discountTotal,
    taxTotal,
    lineTotal: roundMoney(gross - discountTotal + taxTotal, input.currency),
  }
}

export type FormatMoneyOptions = {
  currency: string
  /**
   * Shown instead of the ISO code when set, e.g. `₫` or `$`. Kept as typed:
   * a trailing space in it is the merchant's way to space it from the number.
   */
  symbol?: string | null
  /** Where the symbol goes; the `Space` variants put a space between. */
  position?: "left" | "leftSpace" | "right" | "rightSpace"
}

/** `$12.50`, `$ 12.50`, `12,500₫` or `12,500 ₫` — the store's own style. */
export const formatMoney = (
  amount: number,
  options: FormatMoneyOptions,
): string => {
  const digits = getCurrencyFractionDigits(options.currency)
  const number = new Intl.NumberFormat("en", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(roundMoney(amount, options.currency))
  const symbol = options.symbol || options.currency.toUpperCase()
  switch (options.position) {
    case "leftSpace":
      return `${symbol} ${number}`
    case "right":
      return `${number}${symbol}`
    case "rightSpace":
      return `${number} ${symbol}`
    default:
      return `${symbol}${number}`
  }
}
