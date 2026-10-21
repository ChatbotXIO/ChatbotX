"use client"

import type { OrderStatus, ShippingType } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { CircleCheckIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { formatShopMoney } from "../lib/shop-money"
import { RateOrderForm, StarRating } from "./rate-order-form"
import { useShop } from "./shop-provider"

export type CustomerOrderView = {
  id: string
  number: number
  status: OrderStatus
  currency: string
  subtotal: number
  discountTotal: number
  shippingTotal: number
  serviceFeeTotal: number
  taxTotal: number
  couponDiscount: number
  discountCode: string | null
  total: number
  shippingType: ShippingType | null
  createdAt: string
  rating: number | null
  ratingComment: string | null
  items: Array<{
    id: string
    name: string
    variantLabel: string | null
    quantity: number
    lineTotal: number
  }>
}

const STATUS_VARIANT: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  accepted: "secondary",
  shipped: "secondary",
  concluded: "default",
  cancelled: "destructive",
}

export function OrderView({
  order,
  placed,
  canRate,
}: {
  order: CustomerOrderView
  placed: boolean
  canRate: boolean
}) {
  const t = useTranslations("webshop")
  const format = useFormatter()
  const shop = useShop()
  const money = (amount: number) =>
    formatShopMoney(amount, { ...shop.money, currency: order.currency })
  const otherFees = order.serviceFeeTotal + order.taxTotal

  return (
    <div className="space-y-4">
      {placed ? (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          <CircleCheckIcon className="mt-0.5 size-5 shrink-0" />
          <p>{t("orderPlaced")}</p>
        </div>
      ) : null}

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-xl">
            {t("orderTitle", { number: order.number })}
          </h1>
          <Badge variant={STATUS_VARIANT[order.status]}>
            {t(`status.${order.status}`)}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {t("placedAt", {
            date: format.dateTime(new Date(order.createdAt), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </p>
        <ul className="divide-y">
          {order.items.map((item) => (
            <li
              className="flex justify-between gap-3 py-2 text-sm"
              key={item.id}
            >
              <span className="min-w-0">
                {item.quantity} × {item.name}
                {item.variantLabel ? (
                  <span className="text-muted-foreground">
                    {" "}
                    ({item.variantLabel})
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">
                {money(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("summary.subtotal")}
            </span>
            <span className="tabular-nums">{money(order.subtotal)}</span>
          </div>
          {order.discountTotal > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("summary.discount")}
              </span>
              <span className="tabular-nums">
                {money(-order.discountTotal)}
              </span>
            </div>
          ) : null}
          {order.shippingType === "delivery" ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("summary.delivery")}
              </span>
              <span className="tabular-nums">{money(order.shippingTotal)}</span>
            </div>
          ) : null}
          {otherFees > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("summary.otherFees")}
              </span>
              <span className="tabular-nums">{money(otherFees)}</span>
            </div>
          ) : null}
          {order.couponDiscount > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("summary.coupon", { code: order.discountCode ?? "" })}
              </span>
              <span className="tabular-nums">
                {money(-order.couponDiscount)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold text-base">
            <span>{t("summary.total")}</span>
            <span className="tabular-nums">{money(order.total)}</span>
          </div>
          <p className="pt-1 text-muted-foreground">{t("payment.cod")}</p>
        </div>
      </section>

      {order.rating ? (
        <section className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">{t("yourRating")}</h2>
          <StarRating value={order.rating} />
          {order.ratingComment ? (
            <p className="text-sm">{order.ratingComment}</p>
          ) : null}
        </section>
      ) : null}
      {!order.rating && canRate ? <RateOrderForm orderId={order.id} /> : null}

      <Link
        className={buttonVariants({ variant: "outline", className: "w-full" })}
        href={shop.href()}
      >
        {t("continueShopping")}
      </Link>
    </div>
  )
}
