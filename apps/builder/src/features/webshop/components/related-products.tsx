"use client"

import type { WebshopProductView } from "@chatbotx.io/database/partials"
import { SparklesIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ShopProduct } from "../lib/shop-product"
import { ProductList } from "./product-list"

/**
 * "You may also like" under a product: others in its category or sharing a
 * tag, as the same cards as the shop's front page. Nothing when there are none.
 */
export function RelatedProducts({
  products,
  view,
}: {
  products: ShopProduct[]
  view: WebshopProductView
}) {
  const t = useTranslations("webshop")
  if (products.length === 0) {
    return null
  }
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 font-bold text-xl tracking-tight">
        <SparklesIcon className="size-5 text-primary" />
        {t("relatedProducts")}
      </h2>
      <ProductList products={products} view={view} />
    </section>
  )
}
