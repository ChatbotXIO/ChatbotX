"use client"

import AreaChart from "@chatbotx.io/ui/components/charts/area-chart"
import { useLocale, useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatShortDate } from "../../utils/date-format"

export function MagicLinkStatsChart() {
  const t = useTranslations()
  const locale = useLocale()

  const magicLinkStats = useAnalysisStore((state) => state.magicLinkStats)
  const linkName = useAnalysisStore(
    (state) => state.defaultSearchParams.linkName ?? "",
  )

  return (
    <AreaChart
      data={magicLinkStats.map((row) => ({
        label: formatShortDate(new Date(row.dateReport), locale),
        value: row.count,
      }))}
      title={t("analytics.sessionsThroughTheMagicLink", { ref: linkName })}
      valueLabel={t("analytics.total")}
    />
  )
}
