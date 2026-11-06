"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { ExternalLinkIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect } from "react"
import { getOrderDetailAction } from "@/features/orders/actions/get-order-detail.action"
import {
  formatOrderMoney,
  type StoreCurrencyFormat,
} from "@/features/orders/lib/order-money"
import type { OrderListItem } from "@/features/orders/schema/resource"
import {
  type ShopifyStoreLinks,
  shopifyOrderAdminUrl,
} from "@/features/products/lib/shopify-admin-url"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { OrderShopifyStatusBadges } from "./order-shopify-status-badges"

type OrderShopifyDetailsDialogProps = {
  workspaceId: string
  order: OrderListItem
  store: ShopifyStoreLinks
  currencyFormat: StoreCurrencyFormat
  onOpenChange: (open: boolean) => void
}

/** Read-only view of an order mirrored from Shopify. */
export function OrderShopifyDetailsDialog({
  workspaceId,
  order,
  store,
  currencyFormat,
  onOpenChange,
}: OrderShopifyDetailsDialogProps) {
  const t = useTranslations("orders")
  const format = useFormatter()
  const { execute, result, isPending } = useAction(
    getOrderDetailAction.bind(null, workspaceId, order.id),
    { onError: toastActionError(t("shopify.loadError")) },
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per opened order
  useEffect(() => {
    execute()
  }, [order.id])

  const items = result.data?.items ?? []
  const address = order.shippingAddress
  const addressLines = [
    address?.line1,
    address?.line2,
    [address?.city, address?.state, address?.zip].filter(Boolean).join(", "),
    address?.country,
  ].filter((line): line is string => Boolean(line))
  const money = (amount: number) =>
    formatOrderMoney(amount, order.currency, currencyFormat)
  const orderName = order.externalName ?? `#${order.number}`

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {t("shopify.detailsTitle", { name: orderName })}
            <OrderShopifyStatusBadges
              fulfillmentStatus={order.fulfillmentStatus}
              paymentStatus={order.paymentStatus}
            />
          </DialogTitle>
          <DialogDescription>
            {t("shopify.placedOn", {
              date: format.dateTime(order.createdAt, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="space-y-1 rounded-lg border p-3 text-sm">
            <h3 className="font-medium">{t("shopify.customerDetails")}</h3>
            <p>{order.customerName ?? "—"}</p>
            <p className="text-muted-foreground">
              {order.customerEmail ?? "—"}
            </p>
            <p className="text-muted-foreground">
              {order.customerPhone ?? "—"}
            </p>
          </section>
          <section className="space-y-1 rounded-lg border p-3 text-sm">
            <h3 className="font-medium">{t("shopify.shippingAddress")}</h3>
            {addressLines.length > 0 ? (
              addressLines.map((line) => <p key={line}>{line}</p>)
            ) : (
              <p className="text-muted-foreground">
                {t("shopify.noShippingAddress")}
              </p>
            )}
            {order.trackingNumber ? (
              <p className="text-muted-foreground">
                {t("shopify.tracking", {
                  company: order.trackingCompany ?? "",
                  number: order.trackingNumber,
                })}
              </p>
            ) : null}
          </section>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-sm">{t("shopify.lineItems")}</h3>
          <div className="max-h-56 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("shopify.itemColumn")}</TableHead>
                  <TableHead>{t("shopify.skuColumn")}</TableHead>
                  <TableHead>{t("columns.quantity")}</TableHead>
                  <TableHead>{t("columns.price")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  <TableRow>
                    <TableCell colSpan={4}>{t("shopify.loading")}</TableCell>
                  </TableRow>
                ) : null}
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      {item.variantLabel ? (
                        <div className="text-muted-foreground text-xs">
                          {item.variantLabel}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.sku ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {money(item.unitPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <dl className="ms-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("fields.subtotal")}</dt>
            <dd className="tabular-nums">{money(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("shopify.shipping")}</dt>
            <dd className="tabular-nums">
              {order.shippingTotal === 0
                ? t("shopify.free")
                : money(order.shippingTotal)}
            </dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt>{t("fields.total")}</dt>
            <dd className="tabular-nums">{money(order.total)}</dd>
          </div>
        </dl>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">{t("shopify.close")}</Button>}
          />
          <a
            className={buttonVariants({ variant: "default" })}
            href={shopifyOrderAdminUrl({
              adminUrl: store.adminUrl,
              externalId: order.externalId,
            })}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("shopify.viewOnShopify")}
            <ExternalLinkIcon />
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
