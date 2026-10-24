"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { changeCartAction } from "../actions/webshop.action"
import { trackPixel } from "./facebook-pixel"
import { useShop } from "./shop-provider"
import { useShopErrorMessage } from "./use-shop-error"

type CartChange = {
  mode: "add" | "set"
  productId: string
  variantId: string | null
  quantity: number
  /** For the Pixel's AddToCart value. */
  price?: number
}

/** Adds to or changes the cart, then refreshes what the page shows. */
export function useCartChange() {
  const t = useTranslations("webshop")
  const shop = useShop()
  const router = useRouter()
  const errorMessage = useShopErrorMessage(shop.money)
  const { executeAsync, isPending } = useAction(changeCartAction)

  const change = async (input: CartChange) => {
    const result = await executeAsync({
      workspaceId: shop.workspaceId,
      token: shop.token,
      mode: input.mode,
      productId: input.productId,
      variantId: input.variantId,
      quantity: input.quantity,
    })
    const response = result?.data
    if (!response?.ok) {
      toast.error(errorMessage(response?.error))
      return false
    }
    if (input.mode === "add") {
      toast.success(t("added"))
      trackPixel("AddToCart", {
        content_ids: [input.productId],
        content_type: "product",
        currency: shop.money.currency,
        ...(input.price === undefined
          ? {}
          : { value: input.price * input.quantity }),
      })
    }
    router.refresh()
    return true
  }

  return { change, isPending }
}
