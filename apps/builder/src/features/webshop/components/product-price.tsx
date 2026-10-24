"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { formatShopMoney } from "../lib/shop-money"
import { discountedPrice } from "../lib/shop-product"
import { useShop } from "./shop-provider"

/** The price after the product's discount, with the old price struck out. */
export function ProductPrice({
  price,
  discount,
  className,
}: {
  price: number
  discount: number
  className?: string
}) {
  const { money } = useShop()
  const final = discountedPrice({ discount }, price)
  return (
    <span className={cn("flex flex-wrap items-baseline gap-2", className)}>
      <span className={cn("font-semibold text-primary tabular-nums")}>
        {formatShopMoney(final, money)}
      </span>
      {discount > 0 ? (
        <span className="text-muted-foreground text-sm tabular-nums line-through">
          {formatShopMoney(price, money)}
        </span>
      ) : null}
    </span>
  )
}
