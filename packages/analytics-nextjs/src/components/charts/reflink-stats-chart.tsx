"use client"

import AreaChart from "@chatbotx.io/ui/components/charts/area-chart"
import { useLocale, useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatShortDate } from "../../utils/date-format"

export function ReflinkStatsChart() {
  const t = useTranslations()
  const locale = useLocale()

  const refLinkStats = useAnalysisStore((state) => state.refLinkStats)
  const linkName = useAnalysisStore(
    (state) => state.defaultSearchParams.linkName ?? "",
  )

  return (
    <AreaChart
      data={refLinkStats.map((row) => ({
        label: formatShortDate(new Date(row.dateReport), locale),
        value: row.count,
      }))}
      title={t("analytics.sessionsThroughTheRef", { ref: linkName })}
      valueLabel={t("analytics.total")}
    />
  )
}
