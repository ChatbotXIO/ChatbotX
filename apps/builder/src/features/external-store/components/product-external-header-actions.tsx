"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  type ExternalStoreLinks,
  externalProductsAdminUrl,
} from "../lib/store-links"
import { ProductSyncButton } from "./product-sync-button"

type ProductExternalHeaderActionsProps = {
  workspaceId: string
  store: ExternalStoreLinks
}

/**
 * Replaces Create / Import / Meta Catalog while the store source is an
 * external store.
 */
export function ProductExternalHeaderActions({
  workspaceId,
  store,
}: ProductExternalHeaderActionsProps) {
  const t = useTranslations("products.shopify")
  return (
    <div className="flex items-center gap-2">
      <a
        className={buttonVariants({ size: "sm", variant: "outline" })}
        href={externalProductsAdminUrl(store)}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("openStore", { store: store.storeName })}
        <ExternalLinkIcon />
      </a>
      <ProductSyncButton
        label={t("syncProducts")}
        scope="products"
        source={store.source}
        workspaceId={workspaceId}
      />
    </div>
  )
}
