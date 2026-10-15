"use client"

import type { MessageInboundOrderEntity } from "@chatbotx.io/sdk"
import { useLocale, useTranslations } from "next-intl"
import { formatPrice } from "@/lib/format-price"
import { ProductRow } from "./product-row"

/**
 * The shopping cart a contact sent, as named when it arrived. An item the
 * workspace could not match keeps the channel's own id, so the cart is never
 * shown with holes.
 */
export function InboundOrderBubble({
  order,
}: {
  order: MessageInboundOrderEntity
}) {
  const t = useTranslations("messages.inboundOrder")
  const locale = useLocale()

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-md border bg-muted/50 p-2">
      <span className="font-semibold text-sm">{t("title")}</span>
      <ul className="flex flex-col gap-1.5">
        {order.items.map((item, index) => {
          const price = `${item.quantity} × ${formatPrice(locale, item.itemPrice, item.currency)}`
          return (
            <ProductRow
              detail={
                item.product ? price : `${price} · ${t("unresolvedProduct")}`
              }
              imageUrl={item.product?.imageUrl ?? null}
              // biome-ignore lint/suspicious/noArrayIndexKey: a cart can list one item twice, so no field is unique
              key={`${item.catalogReference.retailerId}-${index}`}
              name={item.product?.name ?? item.catalogReference.retailerId}
            />
          )
        })}
      </ul>
      {order.note && (
        <p className="text-muted-foreground text-xs">
          {t("note")}: {order.note}
        </p>
      )}
    </div>
  )
}
