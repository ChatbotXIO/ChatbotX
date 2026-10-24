import type { CurrencyPosition } from "@chatbotx.io/database/partials"
import { formatMoney } from "@chatbotx.io/utils/money"

/** How the store shows money, from its Payments settings. */
export type ShopMoneyFormat = {
  currency: string
  currencySymbol: string | null
  currencyPosition: CurrencyPosition
}

/**
 * Orders are always in the store currency, so the shop shows every price in
 * it — the product's own number, the store's symbol.
 */
export const formatShopMoney = (amount: number, format: ShopMoneyFormat) =>
  formatMoney(amount, {
    currency: format.currency,
    symbol: format.currencySymbol,
    position: format.currencyPosition,
  })
