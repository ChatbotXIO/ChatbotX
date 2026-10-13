"use client"

import type { SendProductsStepSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { displayLabelKey } from "../lib/form"

/** "Carousel · 3 products", or just the display when it holds no products. */
export function SendProductsSummary({
  step,
}: {
  step: SendProductsStepSchema
}) {
  const t = useTranslations()
  const count = step.sections.reduce(
    (total, section) => total + section.productIds.length,
    0,
  )
  const label = t(displayLabelKey[step.display])
  if (step.display === "catalog") {
    return <>{label}</>
  }
  return (
    <>
      {label} ·{" "}
      {count > 0
        ? t("flows.sendProducts.productsSelected", { count })
        : t("flows.sendProducts.noneSelected")}
    </>
  )
}
