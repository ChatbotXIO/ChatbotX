import type { DiscountType } from "@chatbotx.io/database/partials"

/** "20%", the amount in the store's format, or null for free shipping. */
export const formatDiscountValue = (
  code: { discountType: DiscountType; discountValue: number },
  formatAmount: (amount: number) => string,
): string | null => {
  switch (code.discountType) {
    case "percentage":
      return `${code.discountValue}%`
    case "fixedAmount":
      return formatAmount(code.discountValue)
    default:
      return null
  }
}
