"use client"

import type { ResolvedInboundProductReference } from "@chatbotx.io/sdk"
import { useTranslations } from "next-intl"
import { ProductRow } from "./product-row"

/** The product a contact was looking at when they wrote, shown with their message. */
export function ReferredProductContext({
  reference,
}: {
  reference: ResolvedInboundProductReference
}) {
  const t = useTranslations("messages.referredProduct")
  const { product, catalogReference } = reference

  return (
    <ul className="mt-1 rounded-md border bg-muted/50 p-2">
      <ProductRow
        detail={t("askedAbout")}
        imageUrl={product?.imageUrl ?? null}
        name={product?.name ?? catalogReference.retailerId}
      />
    </ul>
  )
}
