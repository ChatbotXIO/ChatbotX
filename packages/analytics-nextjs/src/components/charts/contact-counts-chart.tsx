"use client"

import AreaChart from "@chatbotx.io/ui/components/charts/area-chart"
import { useLocale, useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatTimeRangeDate } from "../../utils/date-format"

export function ContactCountsChart() {
  const t = useTranslations()
  const locale = useLocale()

  const contactCounts = useAnalysisStore((state) => state.contactCounts)
  const from = useAnalysisStore((state) => state.from)
  const to = useAnalysisStore((state) => state.to)

  return (
    <AreaChart
      data={contactCounts.map((count) => ({
        label: formatTimeRangeDate(count.date, from, to, locale),
        value: count.count,
      }))}
      title={t("analytics.totalContacts")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
