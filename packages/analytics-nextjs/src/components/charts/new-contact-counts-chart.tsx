"use client"

import AreaChart from "@aha.chat/ui/components/charts/area-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function NewContactCountsChart() {
  const t = useTranslations()
  const { newContactCounts } = useAnalysisStore((state) => state)

  return (
    <AreaChart
      data={newContactCounts.map((count) => ({
        label: format(count.date, "MMM d"),
        value: count.count,
      }))}
      title={t("analytics.newContacts")}
      valueLabel={t("analytics.newContacts")}
    />
  )
}
