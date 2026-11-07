"use client"

import type { ProductStatus } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useTranslations } from "next-intl"

const STATUS_VARIANTS = {
  active: "default",
  draft: "outline",
  unlisted: "secondary",
} as const satisfies Record<ProductStatus, "default" | "outline" | "secondary">

/** A product's status as a label — Shopify products show this, not a switch. */
export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const t = useTranslations("products.fields.status.values")
  return <Badge variant={STATUS_VARIANTS[status]}>{t(status)}</Badge>
}
