"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { ProductSyncButton } from "./product-sync-button"

type ProductShopifyHeaderActionsProps = {
  workspaceId: string
  adminUrl: string
}

/** Replaces Create / Import / Meta Catalog while the store source is Shopify. */
export function ProductShopifyHeaderActions({
  workspaceId,
  adminUrl,
}: ProductShopifyHeaderActionsProps) {
  const t = useTranslations("products.shopify")
  return (
    <div className="flex items-center gap-2">
      <a
        className={buttonVariants({ size: "sm", variant: "outline" })}
        href={`${adminUrl}/products`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("openShopify")}
        <ExternalLinkIcon />
      </a>
      <ProductSyncButton
        label={t("syncProducts")}
        scope="products"
        workspaceId={workspaceId}
      />
    </div>
  )
}
