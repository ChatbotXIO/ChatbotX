"use client"

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
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { formatOrderMoney, type StoreCurrencyFormat } from "../lib/order-money"
import type { OrderDetailResource } from "../schema/public"
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
    <p className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      {value}
    </p>
  )
}

/** The order page as the spec draws it: customer, order, lines, actions. */
export function OrderDetail({ workspaceId, order, store }: OrderDetailProps) {
  const t = useTranslations("orders")
  const formatter = useFormatter()
  const money = (amount: number) =>
    formatOrderMoney(amount, order.currency, store)
  const address = order.shippingAddress
  const street = [address?.line1, address?.line2].filter(Boolean).join(", ")

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex justify-end print:hidden">
        <Button onClick={() => window.print()} variant="link">
          {t("print")}
        </Button>
      </div>

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
          {order.conversationId ? (
            <Link
              className="text-primary text-sm hover:underline print:hidden"
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
            label={t("fields.status")}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20" />
                <TableHead>{t("columns.name")}</TableHead>
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
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{item.name}</span>
                      {item.variantLabel ? (
                        <span className="text-muted-foreground text-xs">
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
                  <TableCell className="text-center">
                    {item.vendorName}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OrderStatusActions
        orderId={order.id}
        status={order.status}
        workspaceId={workspaceId}
      />
    </div>
  )
}
