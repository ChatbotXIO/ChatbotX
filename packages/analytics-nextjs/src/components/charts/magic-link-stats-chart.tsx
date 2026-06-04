"use client"

import AreaChart from "@chatbotx.io/ui/components/charts/area-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function MagicLinkStatsChart() {
  const t = useTranslations()

  const magicLinkStats = useAnalysisStore((state) => state.magicLinkStats)
  const linkName = useAnalysisStore(
    (state) => state.defaultSearchParams.linkName ?? "",
  )

  return (
    <AreaChart
      data={magicLinkStats.map((row) => ({
        label: format(new Date(row.dateReport), "MMM d"),
        value: row.count,
      }))}
      title={t("analytics.sessionsThroughTheMagicLink", { ref: linkName })}
      valueLabel={t("analytics.total")}
    />
  )
}
