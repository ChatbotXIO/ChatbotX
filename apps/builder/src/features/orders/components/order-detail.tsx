"use client"

import { isOnlinePaymentMethod } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { cn } from "@chatbotx.io/ui/lib/utils"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { formatOrderMoney, type StoreCurrencyFormat } from "../lib/order-money"
import type { OrderDetailResource } from "../schema/public"
import { OrderPaymentBadge } from "./order-payment-badge"
import { OrderStatusActions } from "./order-status-actions"

type OrderDetailProps = {
  workspaceId: string
  order: OrderDetailResource
  store: StoreCurrencyFormat
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") {
    return null
  }
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      {value}
    </p>
  )
}

/** The order page as the spec draws it: customer, order, lines, actions. */
export function OrderDetail({ workspaceId, order, store }: OrderDetailProps) {
  const t = useTranslations("orders")
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useBlankPrintTitle()

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => window.print()} variant="link">
          {t("print")}
        </Button>
      </div>

      <div className="space-y-4 text-sm">
        <OrderSummary order={order} store={store} workspaceId={workspaceId} />
      </div>

      <OrderStatusActions
        awaitingPayment={
          isOnlinePaymentMethod(order.paymentMethod) &&
          order.paymentStatus === "unpaid"
        }
        orderId={order.id}
        refundAmount={
          isOnlinePaymentMethod(order.paymentMethod) &&
          order.paymentStatus === "paid"
            ? formatOrderMoney(order.total, order.currency, store)
            : null
        }
        status={order.status}
        workspaceId={workspaceId}
      />

      {/* Printed on its own, outside the app shell: only the order details. */}
      {mounted
        ? createPortal(
            <div
              className="hidden space-y-4 p-6 text-4xl print:block"
              data-print-root=""
            >
              <OrderSummary order={order} printing store={store} />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

/**
 * The browser prints the page title in the paper's header, so it is blanked
 * while printing and put back afterwards. A non-breaking space, because an
 * empty title makes the browser print the URL there instead.
 */
function useBlankPrintTitle() {
  useEffect(() => {
    let savedTitle = document.title
    const blankTitle = () => {
      savedTitle = document.title
      document.title = " "
    }
    const restoreTitle = () => {
      document.title = savedTitle
    }
    window.addEventListener("beforeprint", blankTitle)
    window.addEventListener("afterprint", restoreTitle)
    return () => {
      window.removeEventListener("beforeprint", blankTitle)
      window.removeEventListener("afterprint", restoreTitle)
    }
  }, [])
}

type OrderSummaryProps = {
  order: OrderDetailResource
  store: StoreCurrencyFormat
  /** Set for the screen copy only: the printed one has no inbox link. */
  workspaceId?: string
  printing?: boolean
}

function OrderSummary({
  order,
  store,
  workspaceId,
  printing = false,
}: OrderSummaryProps) {
  const t = useTranslations("orders")
  const formatter = useFormatter()
  const money = (amount: number) =>
    formatOrderMoney(amount, order.currency, store)
  const address = order.shippingAddress
  const street = [address?.line1, address?.line2].filter(Boolean).join(", ")
  // The printed copy takes its large text from the print root and wraps long
  // names instead of running off the paper.
  const printCell = printing ? "whitespace-normal" : undefined

  return (
    <>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Field label={t("fields.name")} value={order.customerName} />
          <Field label={t("fields.email")} value={order.customerEmail} />
          <Field label={t("fields.phone")} value={order.customerPhone} />
          <Field label={t("fields.country")} value={address?.country} />
          <Field label={t("fields.state")} value={address?.state} />
          <Field label={t("fields.city")} value={address?.city} />
          <Field label={t("fields.street")} value={street} />
          <Field label={t("fields.zip")} value={address?.zip} />
          {order.shippingType ? (
            <Field
              label={t("fields.shippingType")}
              value={t(`shippingTypes.${order.shippingType}`)}
            />
          ) : null}
          {workspaceId && order.conversationId ? (
            <Link
              className="text-primary text-sm hover:underline"
              href={`/space/${workspaceId}/inbox?conversationId=${order.conversationId}`}
            >
              {t("inbox")}
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <Field label={t("fields.orderId")} value={order.number} />
          <Field
            label={t("fields.date")}
            value={formatter.dateTime(new Date(order.createdAt), {
              dateStyle: "short",
              timeStyle: "short",
            })}
          />
          <Field label={t("fields.subtotal")} value={money(order.subtotal)} />
          {order.discountTotal > 0 ? (
            <Field
              label={t("fields.discount")}
              value={money(-order.discountTotal)}
            />
          ) : null}
          <Field
            label={t("fields.deliveryCost")}
            value={money(order.shippingTotal)}
          />
          <Field
            label={t("fields.otherTaxes")}
            value={money(order.taxTotal + order.serviceFeeTotal)}
          />
          {order.couponDiscount > 0 ? (
            <Field
              label={t("fields.coupon", { code: order.discountCode ?? "" })}
              value={money(-order.couponDiscount)}
            />
          ) : null}
          <Field label={t("fields.total")} value={money(order.total)} />
          <Field
            label={t("fields.paymentMethod")}
            value={t(`paymentMethods.${order.paymentMethod}`)}
          />
          <Field
            label={t("fields.paymentStatus")}
            value={
              printing ? (
                t(`paymentStatuses.${order.paymentStatus}`)
              ) : (
                <OrderPaymentBadge order={order} showMethod={false} />
              )
            }
          />
          {printing ? null : <OrderPayments payments={order.payments} />}
          <Field
            label={t("columns.orderStatus")}
            value={t(`statuses.${order.status}`)}
          />
          {order.note ? (
            <Field label={t("fields.note")} value={order.note} />
          ) : null}
          {order.cancelReason ? (
            <Field
              label={t("fields.cancelReason")}
              value={order.cancelReason}
            />
          ) : null}
          {order.rating ? (
            <Field
              label={t("fields.rating")}
              value={t("ratingValue", { rating: order.rating })}
            />
          ) : null}
          {order.ratingComment ? (
            <Field
              label={t("fields.ratingComment")}
              value={order.ratingComment}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table className={printing ? "text-[length:inherit]" : undefined}>
            <TableHeader>
              <TableRow>
                {printing ? null : <TableHead className="w-20" />}
                <TableHead className={printCell}>{t("columns.name")}</TableHead>
                <TableHead className="w-28 text-center">
                  {t("columns.quantity")}
                </TableHead>
                <TableHead className="w-36 text-center">
                  {t("columns.price")}
                </TableHead>
                <TableHead className="w-40 text-center">
                  {t("columns.vendor")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  {printing ? null : (
                    <TableCell>
                      {item.imageUrl ? (
                        // biome-ignore lint/performance/noImgElement: product image may be any external URL
                        <img
                          alt=""
                          className="size-14 rounded object-cover"
                          height={56}
                          src={item.imageUrl}
                          width={56}
                        />
                      ) : null}
                    </TableCell>
                  )}
                  <TableCell className={printCell}>
                    <div className="flex flex-col">
                      <span>{item.name}</span>
                      {item.variantLabel ? (
                        <span
                          className={
                            printing
                              ? "text-[0.75em] text-muted-foreground"
                              : "text-muted-foreground text-xs"
                          }
                        >
                          {item.variantLabel}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {item.quantity}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {money(item.unitPrice)}
                  </TableCell>
                  <TableCell className={cn("text-center", printCell)}>
                    {item.vendorName}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

/** The provider's dashboard page for a payment, on the store's own account. */
const paymentDashboardUrl = (
  payment: OrderDetailResource["payments"][number],
) => {
  if (!payment.transactionId) {
    return null
  }
  if (payment.provider === "stripe") {
    return `https://dashboard.stripe.com/${payment.livemode ? "" : "test/"}payments/${encodeURIComponent(payment.transactionId)}`
  }
  return `https://www.${payment.livemode ? "" : "sandbox."}paypal.com/activity/payment/${encodeURIComponent(payment.transactionId)}`
}

/** Each attempt to pay the order online, with its transaction. */
function OrderPayments({
  payments,
}: {
  payments: OrderDetailResource["payments"]
}) {
  const t = useTranslations("orders")
  const attempts = payments.filter(
    (payment) => payment.status !== "expired" || payment.transactionId,
  )
  if (attempts.length === 0) {
    return null
  }
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground">{t("fields.payments")}:</p>
      <ul className="space-y-1">
        {attempts.map((payment) => {
          const url = paymentDashboardUrl(payment)
          return (
            <li className="flex flex-wrap items-center gap-2" key={payment.id}>
              <span>{t(`paymentMethods.${payment.provider}`)}</span>
              <span className="text-muted-foreground">
                {t(`attemptStatuses.${payment.status}`)}
              </span>
              {payment.livemode ? null : (
                <span className="text-muted-foreground text-xs">
                  ({t("testPayment")})
                </span>
              )}
              {url && payment.transactionId ? (
                <Link
                  className="font-mono text-xs underline"
                  href={url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {payment.transactionId}
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
