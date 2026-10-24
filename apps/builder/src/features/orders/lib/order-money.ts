import type { CurrencyPosition } from "@chatbotx.io/database/partials"
import { formatMoney } from "@chatbotx.io/utils/money"

export type StoreCurrencyFormat = {
  currency: string
  currencySymbol: string | null
  currencyPosition: CurrencyPosition
}

/**
 * An order amount in the store's own style. An order in another currency (a
 * WhatsApp cart priced by Meta) keeps its ISO code, since the store's symbol
 * would name the wrong money.
 */
export const formatOrderMoney = (
  amount: number,
  orderCurrency: string,
  store: StoreCurrencyFormat,
): string => {
  const isStoreCurrency =
    orderCurrency.toUpperCase() === store.currency.toUpperCase()
  return formatMoney(amount, {
    currency: orderCurrency,
    symbol: isStoreCurrency ? store.currencySymbol : null,
    position: isStoreCurrency ? store.currencyPosition : "left",
  })
}
