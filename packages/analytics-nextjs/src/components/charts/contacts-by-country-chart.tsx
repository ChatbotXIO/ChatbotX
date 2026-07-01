"use client"

import { DonutChart } from "@chatbotx.io/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ContactsByCountryChart() {
  const t = useTranslations()
  const { contactsByCountry } = useAnalysisStore((state) => state)

  const data = useMemo(
    () =>
      contactsByCountry.map((item) => ({
        name: item.dimension || t("analytics.unknown"),
        value: item.uniqueContacts,
      })),
    [contactsByCountry, t],
  )

  return (
    <DonutChart
      data={data}
      noDataLabel={t("analytics.noData")}
      title={t("analytics.newContactsByCountry")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
