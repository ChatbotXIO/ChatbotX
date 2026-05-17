"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { getTimeRangeDateFormat } from "../../utils/date-format"

export function BlockedContactsChart() {
  const t = useTranslations()
  const { blockedContactCounts, from, to } = useAnalysisStore((state) => state)
  const dateFormat = getTimeRangeDateFormat(from, to)

  return (
    <BarChart
      data={blockedContactCounts.map((count) => ({
        name: format(count.date, dateFormat),
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
