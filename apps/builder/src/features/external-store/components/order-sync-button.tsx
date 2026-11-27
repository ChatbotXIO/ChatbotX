"use client"

import type { ExternalStoreSource } from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { ProductSyncButton } from "./product-sync-button"

/** The Sync Orders button of the orders page. */
export function OrderSyncButton({
  workspaceId,
  source,
}: {
  workspaceId: string
  source: ExternalStoreSource
}) {
  const t = useTranslations("orders.shopify")
  return (
    <ProductSyncButton
      label={t("syncOrders")}
      scope="orders"
      source={source}
      workspaceId={workspaceId}
    />
  )
}
