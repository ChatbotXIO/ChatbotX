"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ExternalLinkIcon,
  ImageIcon,
  MinusIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { ShopView } from "../lib/load-shop"
import { formatShopMoney } from "../lib/shop-money"
import type { CartData, CartLineView } from "./cart-types"
import { CheckoutForm } from "./checkout-form"
import { DiscountCodeBox } from "./discount-code-box"
import { trackPixel } from "./facebook-pixel"
import { useShop } from "./shop-provider"
import { useCartChange } from "./use-cart-change"

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 text-sm",
        strong && "font-semibold text-base",
      )}
    >
      <span className={strong ? undefined : "text-muted-foreground"}>
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function CartLine({ line }: { line: CartLineView }) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const { change, isPending } = useCartChange()
  const productId = line.productId
  const setQuantity = (quantity: number) => {
    if (productId) {
      change({
        mode: "set",
        productId,
        variantId: line.variantId ?? null,
        quantity,
      })
    }
  }
  return (
    <li className="flex gap-3 py-3">
      <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {line.imageUrl ? (
          // biome-ignore lint/performance/noImgElement: merchant images come from any host
          <img
            alt=""
            className="h-full w-full object-cover"
            height={64}
            src={line.imageUrl}
            width={64}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-6" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex justify-between gap-2">
          <div className="min-w-0">
            {productId ? (
              <Link
                className="line-clamp-2 font-medium"
                href={shop.href(`/products/${productId}`)}
              >
                {line.name}
              </Link>
            ) : (
              <p className="line-clamp-2 font-medium">{line.name}</p>
            )}
            {line.variantLabel ? (
              <p className="text-muted-foreground text-xs">
                {line.variantLabel}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 font-medium tabular-nums">
            {formatShopMoney(line.lineTotal, shop.money)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center rounded-md border">
            <Button
              aria-label={t("decrease")}
              disabled={isPending || line.quantity <= 1}
              onClick={() => setQuantity(line.quantity - 1)}
              size="icon"
              variant="ghost"
            >
              <MinusIcon />
            </Button>
            <span className="w-8 text-center text-sm tabular-nums">
              {line.quantity}
            </span>
            <Button
              aria-label={t("increase")}
              disabled={isPending}
              onClick={() => setQuantity(line.quantity + 1)}
              size="icon"
              variant="ghost"
            >
              <PlusIcon />
            </Button>
          </div>
          <Button
            aria-label={t("remove")}
            disabled={isPending}
            onClick={() => setQuantity(0)}
            size="icon"
            variant="ghost"
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
    </li>
  )
}

function UnavailableLine({ item }: { item: CartData["unavailable"][number] }) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const { change, isPending } = useCartChange()
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate">{item.name ?? t("deletedProduct")}</p>
        <p className="text-muted-foreground text-xs">
          {item.name && !item.variantId ? (
            <Link
              className="underline"
              href={shop.href(`/products/${item.productId}`)}
            >
              {t("unavailableHint")}
            </Link>
          ) : (
            t("unavailable")
          )}
        </p>
      </div>
      <Button
        aria-label={t("remove")}
        disabled={isPending}
        onClick={() =>
          change({
            mode: "set",
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: 0,
          })
        }
        size="icon"
        variant="ghost"
      >
        <Trash2Icon />
      </Button>
    </li>
  )
}

/**
 * The cart, priced as an order would be, and the way to check out that the
 * store chose: our checkout form, or its own external checkout page.
 */
export function CartView({ cart, shop }: { cart: CartData; shop: ShopView }) {
  const t = useTranslations("webshop")
  const context = useShop()
  const [checkingOut, setCheckingOut] = useState(false)
  const money = (amount: number) => formatShopMoney(amount, shop.money)
  const empty = cart.lines.length === 0 && cart.unavailable.length === 0

  if (empty) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-muted-foreground">{t("cartEmpty")}</p>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={context.href()}
        >
          {t("continueShopping")}
        </Link>
      </div>
    )
  }

  const otherFees = cart.totals.serviceFeeTotal + cart.totals.taxTotal
  const canCheckOut =
    context.open && cart.lines.length > 0 && cart.belowMinimum === null

  const startCheckout = () => {
    trackPixel("InitiateCheckout", {
      currency: shop.money.currency,
      value: cart.totals.total,
      num_items: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    })
    setCheckingOut(true)
  }

  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-xl">{t("cart")}</h1>
      {cart.lines.length > 0 ? (
        <ul className="divide-y rounded-lg border bg-card px-4">
          {cart.lines.map((line) => (
            <CartLine
              key={`${line.productId}-${line.variantId ?? ""}`}
              line={line}
            />
          ))}
        </ul>
      ) : null}
      {cart.unavailable.length > 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-4 py-2">
          <p className="py-1 font-medium text-sm">
            {t("unavailableItems", { count: cart.unavailable.length })}
          </p>
          <ul className="divide-y">
            {cart.unavailable.map((item) => (
              <UnavailableLine
                item={item}
                key={`${item.productId}-${item.variantId ?? ""}`}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {cart.lines.length > 0 ? <DiscountCodeBox cart={cart} /> : null}

      <div className="space-y-2 rounded-lg border bg-card p-4">
        <SummaryRow
          label={t("summary.subtotal")}
          value={money(cart.totals.subtotal)}
        />
        {cart.totals.discountTotal > 0 ? (
          <SummaryRow
            label={t("summary.discount")}
            value={money(-cart.totals.discountTotal)}
          />
        ) : null}
        {cart.shippingType === "delivery" ? (
          <SummaryRow
            label={t("summary.delivery")}
            value={money(cart.totals.shippingTotal)}
          />
        ) : null}
        {otherFees > 0 ? (
          <SummaryRow label={t("summary.otherFees")} value={money(otherFees)} />
        ) : null}
        {cart.discount ? (
          <SummaryRow
            label={t("summary.coupon", { code: cart.discount.code })}
            value={money(-cart.discount.amount)}
          />
        ) : null}
        <SummaryRow
          label={t("summary.total")}
          strong
          value={money(cart.totals.total)}
        />
        {cart.belowMinimum === null ? null : (
          <p className="text-destructive text-sm">
            {t("belowMinimum", { amount: money(cart.belowMinimum) })}
          </p>
        )}
      </div>

      <CheckoutControl
        canCheckOut={canCheckOut}
        cart={cart}
        checkingOut={checkingOut}
        onStart={startCheckout}
        shop={shop}
      />
    </div>
  )
}

/**
 * How the customer checks out: the store's own external page, our form once
 * they start, or the button that starts it.
 */
function CheckoutControl({
  cart,
  shop,
  canCheckOut,
  checkingOut,
  onStart,
}: {
  cart: CartData
  shop: ShopView
  canCheckOut: boolean
  checkingOut: boolean
  onStart: () => void
}) {
  const t = useTranslations("webshop")
  if (shop.checkout.mode === "externalLink") {
    // The store checks out on its own page; without a usable link there is
    // nowhere to send the customer (the server refuses our checkout too).
    if (!shop.checkout.externalLink) {
      return null
    }
    return (
      <a
        aria-disabled={!canCheckOut}
        className={buttonVariants({
          size: "lg",
          className: cn(
            "w-full",
            !canCheckOut && "pointer-events-none opacity-50",
          ),
        })}
        href={shop.checkout.externalLink}
        onClick={() =>
          trackPixel("InitiateCheckout", {
            currency: shop.money.currency,
            value: cart.totals.total,
          })
        }
        rel="noopener noreferrer"
      >
        <ExternalLinkIcon />
        {t("checkOut")}
      </a>
    )
  }
  if (checkingOut) {
    return <CheckoutForm cart={cart} shop={shop} />
  }
  return (
    <Button
      className="w-full"
      disabled={!canCheckOut}
      onClick={onStart}
      size="lg"
    >
      {t("checkOut")}
    </Button>
  )
}
