"use client"

import { DonutChart } from "@aha.chat/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ContactsByCountryChart() {
  const t = useTranslations()
  const { contactsByCountry } = useAnalysisStore((state) => state)

  const data = useMemo(() => {
    return contactsByCountry.map((item) => ({
      name: item.dimension || "Unknown",
      value: item.uniqueContacts,
    }))
  }, [contactsByCountry])

  return (
    <DonutChart
      data={data}
      title={t("analytics.newContactsByCountry")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
