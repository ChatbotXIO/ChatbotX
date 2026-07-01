"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { useLocale, useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatTimeRangeDate } from "../../utils/date-format"

export function NewContactCountsChart() {
  const t = useTranslations()
  const locale = useLocale()
  const { newContactCounts, from, to } = useAnalysisStore((state) => state)

  return (
    <BarChart
      data={newContactCounts.map((count) => ({
        name: formatTimeRangeDate(count.date, from, to, locale),
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
