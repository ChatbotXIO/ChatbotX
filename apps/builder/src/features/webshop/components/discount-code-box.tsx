"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  ChevronDownIcon,
  Loader2Icon,
  TicketPercentIcon,
  TruckIcon,
  XIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type FormEvent, useId, useState } from "react"
import { toast } from "sonner"
import {
  applyDiscountCodeAction,
  removeDiscountCodeAction,
} from "../actions/webshop.action"
import { formatShopMoney } from "../lib/shop-money"
import type { CartData } from "./cart-types"
import { CouponTicket } from "./coupon-ticket"
import { useShop } from "./shop-provider"
import { useShopErrorMessage } from "./use-shop-error"

/**
 * The discount code on the cart: the codes the customer can pick, as tickets
 * (the one taking off the most first, marked "Best choice"), the code applied
 * when it is not one of them (automatic, or typed), and a field to type one.
 * A typed code that stopped working says why.
 */
/** Tickets shown before "Show more". */
const COLLAPSED_TICKETS = 3

export function DiscountCodeBox({ cart }: { cart: CartData }) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const router = useRouter()
  const inputId = useId()
  const errorMessage = useShopErrorMessage(shop.money)
  const [code, setCode] = useState("")
  const [showAll, setShowAll] = useState(false)
  /** The badge being applied, for its spinner. */
  const [applying, setApplying] = useState<string | null>(null)
  const apply = useAction(applyDiscountCodeAction)
  const remove = useAction(removeDiscountCodeAction)

  const applyCode = async (value: string) => {
    if (!value.trim()) {
      return
    }
    setApplying(value)
    const result = await apply.executeAsync({
      workspaceId: shop.workspaceId,
      token: shop.token,
      code: value,
      ...(cart.shippingType ? { shippingType: cart.shippingType } : {}),
    })
    setApplying(null)
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

  const submit = (event: FormEvent) => {
    event.preventDefault()
    applyCode(code)
  }

  const clear = async () => {
    await remove.executeAsync({
      workspaceId: shop.workspaceId,
      token: shop.token,
    })
    router.refresh()
  }

  const applied = cart.discount
  const typedApplied = applied && !applied.automatic ? applied : null
  const appliedCode = applied?.code.toLowerCase()
  const offered = cart.availableDiscounts
  const usableCount = offered.filter(
    (discount) => discount.status === "available",
  ).length
  const appliedIsOffered = offered.some(
    (discount) =>
      discount.status === "available" &&
      discount.code.toLowerCase() === appliedCode,
  )
  const shown = showAll ? offered : offered.slice(0, COLLAPSED_TICKETS)
  const hidden = offered.length - shown.length

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-xs">
      <h2 className="flex items-center gap-2 font-semibold">
        <TicketPercentIcon className="size-5 text-primary" />
        {t("discount.label")}
      </h2>

      {applied && !appliedIsOffered ? (
        <div className="fade-in zoom-in-95 flex animate-in items-center gap-3 rounded-xl border border-primary/40 border-dashed bg-primary/5 p-3 duration-300">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {applied.discountType === "freeShipping" ? (
              <TruckIcon className="size-4" />
            ) : (
              <TicketPercentIcon className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold tracking-wide">
              {applied.code}
            </p>
            <p className="text-muted-foreground text-xs">
              {applied.automatic
                ? t("discount.automatic")
                : t("discount.applied")}
            </p>
          </div>
          <span className="shrink-0 font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
            -{formatShopMoney(applied.amount, shop.money)}
          </span>
          {typedApplied ? (
            <Button
              aria-label={t("discount.remove")}
              className="size-8 shrink-0 rounded-full"
              disabled={remove.isPending}
              onClick={clear}
              size="icon"
              variant="ghost"
            >
              {remove.isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <XIcon />
              )}
            </Button>
          ) : null}
        </div>
      ) : null}

      {cart.discountError && cart.enteredDiscountCode ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-destructive text-sm">
          <span>
            <span className="font-semibold">{cart.enteredDiscountCode}</span>:{" "}
            {errorMessage(cart.discountError)}
          </span>
          <Button
            aria-label={t("discount.remove")}
            className="size-8 shrink-0 rounded-full"
            disabled={remove.isPending}
            onClick={clear}
            size="icon"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      ) : null}

      {offered.length > 0 ? (
        <div className="space-y-2.5">
          <p className="text-muted-foreground text-xs">
            {t("discount.available")}
          </p>
          {shown.map((discount, index) => {
            const usable = discount.status === "available"
            const inUse = usable && discount.code.toLowerCase() === appliedCode
            return (
              <CouponTicket
                // Usable codes come first, the one taking off the most on top.
                best={index === 0 && usable && usableCount > 1}
                disabled={apply.isPending || remove.isPending}
                discount={discount}
                inUse={inUse}
                key={discount.code}
                onApply={() => applyCode(discount.code)}
                onRemove={clear}
                pending={
                  applying === discount.code || (inUse && remove.isPending)
                }
              />
            )
          })}
          {offered.length > COLLAPSED_TICKETS ? (
            <Button
              className="w-full rounded-full text-muted-foreground"
              onClick={() => setShowAll((current) => !current)}
              size="sm"
              variant="ghost"
            >
              {showAll
                ? t("discount.showLess")
                : t("discount.showMore", { count: hidden })}
              <ChevronDownIcon
                className={
                  showAll
                    ? "rotate-180 transition-transform"
                    : "transition-transform"
                }
              />
            </Button>
          ) : null}
        </div>
      ) : null}

      {typedApplied ? null : (
        <form className="flex gap-2" onSubmit={submit}>
          <label className="sr-only" htmlFor={inputId}>
            {t("discount.label")}
          </label>
          <Input
            autoComplete="off"
            className="h-10 rounded-full bg-background px-4 uppercase placeholder:normal-case"
            id={inputId}
            maxLength={64}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t("discount.placeholder")}
            value={code}
          />
          <Button
            className="h-10 rounded-full px-5"
            disabled={apply.isPending || !code.trim()}
            type="submit"
            variant="outline"
          >
            {applying === code && code ? (
              <Loader2Icon className="animate-spin" />
            ) : null}
            {t("discount.apply")}
          </Button>
        </form>
      )}
    </section>
  )
}
