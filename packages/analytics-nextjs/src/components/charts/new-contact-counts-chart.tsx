"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function NewContactCountsChart() {
  const t = useTranslations()
  const { newContactCounts } = useAnalysisStore((state) => state)

  return (
    <BarChart
      data={newContactCounts.map((count) => ({
        name: format(count.date, "MMM d"),
        value: [
          {
            label: t("analytics.newContacts"),
            value: count.count,
          },
        ],
      }))}
      title={t("analytics.newContacts")}
    />
  )
}
