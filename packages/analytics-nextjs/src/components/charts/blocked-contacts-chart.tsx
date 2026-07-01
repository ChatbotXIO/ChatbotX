"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { useLocale, useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatTimeRangeDate } from "../../utils/date-format"

export function BlockedContactsChart() {
  const t = useTranslations()
  const locale = useLocale()
  const { blockedContactCounts, from, to } = useAnalysisStore((state) => state)

  return (
    <BarChart
      data={blockedContactCounts.map((count) => ({
        name: formatTimeRangeDate(count.date, from, to, locale),
        value: [
          {
            label: t("analytics.blockedContacts"),
            value: count.count,
          },
        ],
      }))}
      helpText={t("analytics.blockedContactsHelp")}
      title={t("analytics.blockedContacts")}
    />
  )
}
