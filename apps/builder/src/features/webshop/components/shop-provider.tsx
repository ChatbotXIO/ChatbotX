"use client"

import type {
  CheckoutMode,
  ProductButtonType,
} from "@chatbotx.io/database/partials"
import { createContext, type ReactNode, useContext } from "react"
import { shopHref } from "../lib/shop-href"
import type { ShopMoneyFormat } from "../lib/shop-money"

export type ShopContextValue = {
  workspaceId: string
  token: string
  money: ShopMoneyFormat
  /** A preview link browses but never orders. */
  preview: boolean
  /** The store takes orders right now. */
  open: boolean
  checkoutMode: CheckoutMode
  productButtons: readonly ProductButtonType[]
}

const ShopContext = createContext<ShopContextValue | null>(null)

export function ShopProvider({
  value,
  children,
}: {
  value: ShopContextValue
  children: ReactNode
}) {
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const shop = useContext(ShopContext)
  if (!shop) {
    throw new Error("useShop must be used inside ShopProvider")
  }
  return {
    ...shop,
    href: (
      path = "",
      params: Record<string, string | number | null | undefined> = {},
    ) => shopHref(shop.workspaceId, shop.token, path, params),
  }
}
