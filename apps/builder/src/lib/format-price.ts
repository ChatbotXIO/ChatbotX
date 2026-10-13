/** A stored currency code Intl does not know falls back to "price CODE" rather than throwing. */
export const formatPrice = (
  locale: string,
  price: number,
  currency: string,
): string => {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(price)
  } catch {
    return `${price} ${currency}`
  }
}
