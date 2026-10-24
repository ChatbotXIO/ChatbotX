"use client"

import type { SendCollectionStepSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { useCollectionOptions } from "./use-collection-options"

/** One line telling what the collection will send. */
export function CollectionSummary({
  step,
}: {
  step: SendCollectionStepSchema
}) {
  const t = useTranslations("flows.sendCollection")
  const options = useCollectionOptions()
  if (step.collectionType === "manual") {
    return <>{t("summaryManual", { count: step.productIds.length })}</>
  }
  const { conditions } = step
  const parts = [
    conditions.name.trim() ? `“${conditions.name.trim()}”` : null,
    options.categoryName(conditions.subcategoryId ?? conditions.categoryId),
    options.vendorName(conditions.vendorId),
  ].filter(Boolean)
  return (
    <>
      {parts.length > 0
        ? t("summaryAutomated", { filters: parts.join(" · ") })
        : t("summaryAll")}
    </>
  )
}
