"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Loader2Icon, TicketPercentIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type FormEvent, useId, useState } from "react"
import { toast } from "sonner"
import {
  applyDiscountCodeAction,
  removeDiscountCodeAction,
} from "../actions/webshop.action"
import type { CartData } from "./cart-types"
import { useShop } from "./shop-provider"
import { useShopErrorMessage } from "./use-shop-error"

/**
 * The discount code on the cart: a field to type one, or the code applied
 * (typed, or automatic) with what it takes off. A typed code that stopped
 * working says why.
 */
export function DiscountCodeBox({ cart }: { cart: CartData }) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const router = useRouter()
  const inputId = useId()
  const errorMessage = useShopErrorMessage(shop.money)
  const [code, setCode] = useState("")
  const apply = useAction(applyDiscountCodeAction)
  const remove = useAction(removeDiscountCodeAction)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!code.trim()) {
      return
    }
    const result = await apply.executeAsync({
      workspaceId: shop.workspaceId,
      token: shop.token,
      code,
      ...(cart.shippingType ? { shippingType: cart.shippingType } : {}),
    })
    const response = result?.data
    if (!response?.ok) {
      toast.error(errorMessage(response?.error))
      return
    }
    if (response.data.discountError) {
      toast.error(errorMessage(response.data.discountError))
      return
    }
    toast.success(t("discount.applied"))
    setCode("")
    router.refresh()
  }

  const clear = async () => {
    await remove.executeAsync({
      workspaceId: shop.workspaceId,
      token: shop.token,
    })
    router.refresh()
  }

  const typedApplied =
    cart.discount && !cart.discount.automatic ? cart.discount : null

  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      {cart.discount ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <TicketPercentIcon className="size-4 text-primary" />
            <Badge variant="secondary">{cart.discount.code}</Badge>
            {cart.discount.automatic ? (
              <span className="text-muted-foreground">
                {t("discount.automatic")}
              </span>
            ) : null}
          </div>
          {typedApplied ? (
            <Button
              aria-label={t("discount.remove")}
              disabled={remove.isPending}
              onClick={clear}
              size="icon"
              variant="ghost"
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
      ) : null}
      {cart.discountError && cart.enteredDiscountCode ? (
        <div className="flex items-center justify-between gap-2 text-destructive text-sm">
          <span>
            {cart.enteredDiscountCode}: {errorMessage(cart.discountError)}
          </span>
          <Button
            aria-label={t("discount.remove")}
            disabled={remove.isPending}
            onClick={clear}
            size="icon"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      ) : null}
      {typedApplied ? null : (
        <form className="flex gap-2" onSubmit={submit}>
          <label className="sr-only" htmlFor={inputId}>
            {t("discount.label")}
          </label>
          <Input
            autoComplete="off"
            id={inputId}
            maxLength={64}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t("discount.placeholder")}
            value={code}
          />
          <Button
            disabled={apply.isPending || !code.trim() || shop.preview}
            type="submit"
            variant="outline"
          >
            {apply.isPending ? <Loader2Icon className="animate-spin" /> : null}
            {t("discount.apply")}
          </Button>
        </form>
      )}
    </div>
  )
}
