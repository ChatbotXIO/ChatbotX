"use client"

import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { formatShopMoney } from "../lib/shop-money"
import type { CartData } from "./cart-types"
import { ShopBottomBar } from "./shop-bottom-bar"
import { useShop } from "./shop-provider"

/** What the line discounts and the coupon take off the cart together. */
export const cartSavings = (cart: CartData) =>
  cart.totals.discountTotal + (cart.discount?.amount ?? 0)

/**
 * The cart's total and its next step (Check out, then Place order), on the
 * shop's bottom bar.
 */
export function CheckoutBar({
  cart,
  hint,
  children,
}: {
  cart: CartData
  /** Why the button is off, e.g. below the store minimum. */
  hint?: string | null
  children: ReactNode
}) {
  const t = useTranslations("webshop")
  const { money } = useShop()
  const savings = cartSavings(cart)
  return (
    <ShopBottomBar className="max-w-2xl">
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">{t("summary.total")}</p>
        <p className="truncate font-bold text-primary text-xl tabular-nums leading-tight">
          {formatShopMoney(cart.totals.total, money)}
        </p>
        {hint ? (
          <p className="truncate text-destructive text-xs">{hint}</p>
        ) : null}
        {!hint && savings > 0 ? (
          <p className="truncate text-emerald-600 text-xs dark:text-emerald-400">
            {t("summary.saved", { amount: formatShopMoney(savings, money) })}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </ShopBottomBar>
  )
}
