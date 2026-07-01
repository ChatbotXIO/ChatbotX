"use client"

import { DonutChart } from "@chatbotx.io/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ContactsBySourceChart() {
  const t = useTranslations()
  const { contactsBySource } = useAnalysisStore((state) => state)

  const data = useMemo(
    () =>
      contactsBySource.map((item) => ({
        name: item.dimension || t("analytics.unknown"),
        value: item.uniqueContacts,
      })),
    [contactsBySource, t],
  )

  return (
    <DonutChart
      data={data}
      noDataLabel={t("analytics.noData")}
      title={t("analytics.newContactsBySource")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
