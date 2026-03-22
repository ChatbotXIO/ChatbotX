"use client"

import AreaChart from "@aha.chat/ui/components/charts/area-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ContactCountsChart() {
  const t = useTranslations()

  const { contactCounts } = useAnalysisStore((state) => state)

  return (
    <AreaChart
      data={contactCounts.map((count) => ({
        label: format(count.date, "MMM d"),
        value: count.count,
      }))}
      title={t("analytics.totalContacts")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
