"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ClockIcon,
  Loader2Icon,
  SparklesIcon,
  TicketPercentIcon,
  TruckIcon,
  XIcon,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import type { CSSProperties } from "react"
import { formatShopMoney } from "../lib/shop-money"
import type { CartData } from "./cart-types"
import { useShop } from "./shop-provider"

type AvailableDiscount = CartData["availableDiscounts"][number]

/** Half-circle bites down the left edge, like a torn-off ticket stub. */
const SERRATED_LEFT_EDGE: CSSProperties = {
  maskImage: "radial-gradient(circle at 0 7px, transparent 5px, #000 5.5px)",
  maskSize: "100% 14px",
  maskRepeat: "repeat-y",
  WebkitMaskImage:
    "radial-gradient(circle at 0 7px, transparent 5px, #000 5.5px)",
  WebkitMaskSize: "100% 14px",
  WebkitMaskRepeat: "repeat-y",
}

/** A code ending within this reads as ending soon. */
const ENDING_SOON_MS = 3 * 24 * 60 * 60 * 1000

/**
 * One code the cart offers, drawn as a ticket: the stub says what it takes
 * off, the body its code, saving and end date, and the button applies it.
 * An ended or used-up code is greyed out and says so instead of a button.
 */
export function CouponTicket({
  discount,
  best,
  inUse,
  pending,
  disabled,
  onApply,
  onRemove,
}: {
  discount: AvailableDiscount
  /** The one taking off the most, marked "Best choice". */
  best: boolean
  inUse: boolean
  pending: boolean
  disabled: boolean
  onApply: () => void
  onRemove: () => void
}) {
  const t = useTranslations("webshop")
  const format = useFormatter()
  const { money } = useShop()
  const freeShipping = discount.discountType === "freeShipping"
  const usable = discount.status === "available"
  const endsAt = discount.endsAt ? new Date(discount.endsAt) : null
  const endingSoon =
    usable && endsAt !== null && endsAt.getTime() - Date.now() < ENDING_SOON_MS

  const stubValue = (() => {
    if (freeShipping) {
      return t("discount.freeShipping")
    }
    if (discount.discountType === "percentage") {
      return `-${discount.discountValue}%`
    }
    return `-${formatShopMoney(discount.discountValue, money)}`
  })()

  return (
    <div
      aria-disabled={!usable}
      className={cn(
        "fade-in slide-in-from-bottom-1 relative flex animate-in overflow-hidden rounded-r-xl shadow-xs transition-shadow duration-300 motion-reduce:animate-none",
        usable ? "hover:shadow-md" : "cursor-not-allowed opacity-70",
        inUse && "ring-2 ring-primary",
      )}
      style={SERRATED_LEFT_EDGE}
    >
      <div
        className={cn(
          "flex w-24 shrink-0 flex-col items-center justify-center gap-1 border-r-2 border-dashed px-2 py-3 text-center",
          usable
            ? "border-primary-foreground/40 bg-primary text-primary-foreground"
            : "border-background/60 bg-muted-foreground/40 text-background",
        )}
      >
        {freeShipping ? (
          <TruckIcon className="size-5" />
        ) : (
          <TicketPercentIcon className="size-5" />
        )}
        <span
          className={cn(
            "font-bold tabular-nums leading-tight",
            freeShipping || stubValue.length > 6 ? "text-xs" : "text-lg",
          )}
        >
          {stubValue}
        </span>
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-r-xl border-y border-r p-3",
          inUse ? "border-primary bg-primary/5" : "bg-card",
          !usable && "text-muted-foreground",
          // Room for the "Best choice" corner tag.
          best && "pt-6",
        )}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold tracking-wide">
              {discount.code}
            </span>
            {inUse ? (
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 font-medium text-[10px] text-primary-foreground">
                {t("discount.inUse")}
              </span>
            ) : null}
          </p>
          {usable ? (
            <p className="font-medium text-emerald-600 text-xs tabular-nums dark:text-emerald-400">
              {t("discount.saves", {
                amount: formatShopMoney(discount.amount, money),
              })}
            </p>
          ) : null}
          <p
            className={cn(
              "flex items-center gap-1 text-xs",
              endingSoon ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <ClockIcon className="size-3 shrink-0" />
            <span className="truncate">
              {endsAt
                ? t("discount.expiresOn", {
                    date: format.dateTime(endsAt, {
                      dateStyle: "medium",
                      timeStyle: endingSoon ? "short" : undefined,
                    }),
                  })
                : t("discount.noExpiry")}
            </span>
          </p>
        </div>
        {usable ? null : (
          <span className="shrink-0 rounded-full border border-dashed px-3 py-1 font-medium text-xs">
            {t(`discount.${discount.status}`)}
          </span>
        )}
        {usable && inUse ? (
          <Button
            aria-label={t("discount.remove")}
            className="h-8 shrink-0 rounded-full px-3"
            disabled={disabled}
            onClick={onRemove}
            size="sm"
            variant="outline"
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <XIcon />}
            {t("discount.removeShort")}
          </Button>
        ) : null}
        {usable && !inUse ? (
          <Button
            className="h-8 shrink-0 rounded-full px-4 active:scale-95"
            disabled={disabled}
            onClick={onApply}
            size="sm"
          >
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            {t("discount.apply")}
          </Button>
        ) : null}
      </div>

      {best ? (
        <span className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-lg bg-amber-500 px-2 py-0.5 font-semibold text-[10px] text-white shadow-sm">
          <SparklesIcon className="size-3" />
          {t("discount.bestChoice")}
        </span>
      ) : null}
    </div>
  )
}
