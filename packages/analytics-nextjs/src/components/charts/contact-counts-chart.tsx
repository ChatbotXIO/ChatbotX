"use client"

import AreaChart from "@chatbotx.io/ui/components/charts/area-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { getTimeRangeDateFormat } from "../../utils/date-format"

export function ContactCountsChart() {
  const t = useTranslations()

  const { contactCounts, from, to } = useAnalysisStore((state) => state)
  const dateFormat = getTimeRangeDateFormat(from, to)

  return (
    <AreaChart
      data={contactCounts.map((count) => ({
        label: format(count.date, dateFormat),
        value: count.count,
      }))}
      title={t("analytics.totalContacts")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
