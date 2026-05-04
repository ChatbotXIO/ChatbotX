"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { getTimeRangeDateFormat } from "../../utils/date-format"

export function NewContactCountsChart() {
  const t = useTranslations()
  const { newContactCounts, from, to } = useAnalysisStore((state) => state)
  const dateFormat = getTimeRangeDateFormat(from, to)

  return (
    <BarChart
      data={newContactCounts.map((count) => ({
        name: format(count.date, dateFormat),
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
