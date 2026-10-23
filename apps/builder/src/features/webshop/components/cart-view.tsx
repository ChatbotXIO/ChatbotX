"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BadgePercentIcon,
  ExternalLinkIcon,
  type LucideIcon,
  MinusIcon,
  PlusIcon,
  ReceiptTextIcon,
  ShoppingBagIcon,
  TagIcon,
  TicketPercentIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TruckIcon,
  WalletIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import type { ShopView } from "../lib/load-shop"
import { formatShopMoney } from "../lib/shop-money"
import type { CartData, CartLineView } from "./cart-types"
import { CheckoutBar, cartSavings } from "./checkout-bar"
import { CheckoutForm } from "./checkout-form"
import { DiscountCodeBox } from "./discount-code-box"
import { trackPixel } from "./facebook-pixel"
import { ShopImage } from "./shop-image"
import { useShop } from "./shop-provider"
import { useCartChange } from "./use-cart-change"

/** One line of the order summary; a saving reads green. */
function SummaryRow({
  icon: Icon,
  label,
  value,
  saving = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  saving?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            saving
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "shrink-0 font-medium tabular-nums",
          saving && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </span>
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
    <li
      aria-busy={isPending}
      className={cn(
        "fade-in flex animate-in gap-3 py-4 transition-opacity duration-200 motion-reduce:animate-none",
        isPending && "opacity-60",
      )}
    >
      {productId ? (
        // The same page as the name; hidden from screen readers, which
        // already reach it through the name.
        <Link
          aria-hidden
          className="group size-20 shrink-0 overflow-hidden rounded-xl"
          href={shop.href(`/products/${productId}`)}
          tabIndex={-1}
        >
          <ShopImage
            alt=""
            className="transition-transform duration-300 group-hover:scale-105"
            iconClassName="size-6"
            size={80}
            src={line.imageUrl ?? null}
          />
        </Link>
      ) : (
        <div className="size-20 shrink-0 overflow-hidden rounded-xl">
          <ShopImage
            alt=""
            iconClassName="size-6"
            size={80}
            src={line.imageUrl ?? null}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex justify-between gap-2">
          <div className="min-w-0">
            {productId ? (
              <Link
                className="line-clamp-2 font-medium transition-colors hover:text-primary"
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
            <p className="text-muted-foreground text-xs tabular-nums">
              {formatShopMoney(line.unitPrice, shop.money)} × {line.quantity}
            </p>
          </div>
          <span className="shrink-0 font-semibold tabular-nums">
            {formatShopMoney(line.lineTotal, shop.money)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center rounded-full border bg-background">
            <Button
              aria-label={t("decrease")}
              className="size-8 rounded-full"
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
              className="size-8 rounded-full"
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
            className="rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
      <div className="fade-in zoom-in-95 flex animate-in flex-col items-center gap-4 py-20 text-center duration-500">
        <span className="flex size-20 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShoppingBagIcon className="size-9" />
        </span>
        <p className="text-muted-foreground">{t("cartEmpty")}</p>
        <Link
          className={cn(buttonVariants({ className: "rounded-full" }))}
          href={context.href()}
        >
          {t("continueShopping")}
        </Link>
      </div>
    )
  }

  const otherFees = cart.totals.serviceFeeTotal + cart.totals.taxTotal
  const savings = cartSavings(cart)
  const itemCount = cart.lines.reduce((sum, line) => sum + line.quantity, 0)
  const canCheckOut =
    context.open && cart.lines.length > 0 && cart.belowMinimum === null

  const startCheckout = () => {
    trackPixel("InitiateCheckout", {
      currency: shop.money.currency,
      value: cart.totals.total,
      num_items: itemCount,
    })
    setCheckingOut(true)
  }

  return (
    // Room under the content for the pinned checkout bar.
    <div className="mx-auto max-w-2xl space-y-4 pb-32">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-bold text-2xl tracking-tight">
          {t("cart")}
          {itemCount > 0 ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary text-sm">
              {t("itemCount", { count: itemCount })}
            </span>
          ) : null}
        </h1>
        <Link
          className="flex shrink-0 items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-primary"
          href={context.href()}
        >
          <ArrowLeftIcon className="size-4" />
          {t("continueShopping")}
        </Link>
      </div>
      {cart.lines.length > 0 ? (
        <ul className="divide-y rounded-2xl border bg-card px-4 shadow-xs">
          {cart.lines.map((line) => (
            <CartLine
              key={`${line.productId}-${line.variantId ?? ""}`}
              line={line}
            />
          ))}
        </ul>
      ) : null}
      {cart.unavailable.length > 0 ? (
        <div className="rounded-2xl border border-amber-300 border-dashed bg-amber-50/60 px-4 py-2 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="flex items-center gap-2 py-1 font-medium text-amber-900 text-sm dark:text-amber-100">
            <TriangleAlertIcon className="size-4 shrink-0" />
            {t("unavailableItems", { count: cart.unavailable.length })}
          </p>
          {cart.lines.length > 0 ? (
            <p className="pb-1 text-amber-900/80 text-xs dark:text-amber-100/80">
              {t("unavailableNotOrdered")}
            </p>
          ) : null}
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

      <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-xs">
        <h2 className="flex items-center gap-2 font-semibold">
          <ReceiptTextIcon className="size-5 text-primary" />
          {t("summary.title")}
        </h2>
        <SummaryRow
          icon={ShoppingBagIcon}
          label={t("summary.subtotal")}
          value={money(cart.totals.subtotal)}
        />
        {cart.totals.discountTotal > 0 ? (
          <SummaryRow
            icon={TagIcon}
            label={t("summary.discount")}
            saving
            value={money(-cart.totals.discountTotal)}
          />
        ) : null}
        {cart.discount ? (
          <SummaryRow
            icon={TicketPercentIcon}
            label={t("summary.coupon", { code: cart.discount.code })}
            saving
            value={money(-cart.discount.amount)}
          />
        ) : null}
        {cart.shippingType === "delivery" ? (
          <SummaryRow
            icon={TruckIcon}
            label={t("summary.delivery")}
            value={money(cart.totals.shippingTotal)}
          />
        ) : null}
        {otherFees > 0 ? (
          <SummaryRow
            icon={WalletIcon}
            label={t("summary.otherFees")}
            value={money(otherFees)}
          />
        ) : null}
        <div className="flex items-end justify-between gap-4 border-t border-dashed pt-3">
          <span className="font-semibold">{t("summary.total")}</span>
          <span className="font-bold text-2xl text-primary tabular-nums">
            {money(cart.totals.total)}
          </span>
        </div>
        {savings > 0 ? (
          <p className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 py-2 font-medium text-emerald-700 text-sm dark:text-emerald-300">
            <BadgePercentIcon className="size-4" />
            {t("summary.saved", { amount: money(savings) })}
          </p>
        ) : null}
        {cart.belowMinimum === null ? null : (
          <p className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-destructive text-sm">
            <TriangleAlertIcon className="size-4 shrink-0" />
            {t("belowMinimum", { amount: money(cart.belowMinimum) })}
          </p>
        )}
      </section>

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
  const formRef = useRef<HTMLDivElement>(null)
  const hint =
    cart.belowMinimum === null
      ? null
      : t("belowMinimum", {
          amount: formatShopMoney(cart.belowMinimum, shop.money),
        })
  const buttonClass =
    "h-12 min-w-36 rounded-full px-6 shadow-md active:scale-95"

  // Starting the checkout brings its form into view.
  useEffect(() => {
    if (checkingOut) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [checkingOut])

  if (shop.checkout.mode === "externalLink") {
    // The store checks out on its own page; without a usable link there is
    // nowhere to send the customer (the server refuses our checkout too).
    if (!shop.checkout.externalLink) {
      return null
    }
    return (
      <CheckoutBar cart={cart} hint={hint}>
        <a
          aria-disabled={!canCheckOut}
          className={cn(
            buttonVariants({
              size: "lg",
              className: cn(
                buttonClass,
                !canCheckOut && "pointer-events-none opacity-50",
              ),
            }),
          )}
          href={shop.checkout.externalLink}
          onClick={() =>
            trackPixel("InitiateCheckout", {
              currency: shop.money.currency,
              value: cart.totals.total,
            })
          }
          rel="noopener noreferrer"
        >
          {t("checkOut")}
          <ExternalLinkIcon />
        </a>
      </CheckoutBar>
    )
  }
  if (checkingOut) {
    return (
      <div
        className="fade-in slide-in-from-bottom-2 animate-in scroll-mt-20 duration-300 motion-reduce:animate-none"
        ref={formRef}
      >
        <CheckoutForm cart={cart} shop={shop} />
      </div>
    )
  }
  return (
    <CheckoutBar cart={cart} hint={hint}>
      <Button
        className={buttonClass}
        disabled={!canCheckOut}
        onClick={onStart}
        size="lg"
      >
        {t("checkOut")}
        <ArrowRightIcon />
      </Button>
    </CheckoutBar>
  )
}
