type FormatPriceOptions = {
  /** Upper bound on decimals shown (Intl default depends on the currency). */
  maximumFractionDigits?: number
}

/** A stored currency code Intl does not know falls back to "price CODE" rather than throwing. */
export const formatPrice = (
  locale: string,
  price: number,
  currency: string,
  options: FormatPriceOptions = {},
): string => {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...options,
    }).format(price)
  } catch {
    return `${price} ${currency}`
  }
}
