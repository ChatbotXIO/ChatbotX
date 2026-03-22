"use client"

import { DonutChart } from "@aha.chat/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ContactsBySourceChart() {
  const t = useTranslations()
  const { contactsBySource } = useAnalysisStore((state) => state)

  const data = useMemo(() => {
    return contactsBySource.map((item) => ({
      name: item.dimension || "Unknown",
      value: item.uniqueContacts,
    }))
  }, [contactsBySource])

  return (
    <DonutChart
      data={data}
      title={t("analytics.newContactsBySource")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
