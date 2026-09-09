"use client"

import AreaChart from "@chatbotx.io/ui/components/charts/area-chart"
import { useLocale, useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatShortDate } from "../../utils/date-format"

export function CommentAutomationRepliesChart() {
  const t = useTranslations()
  const locale = useLocale()

  const replyStats = useAnalysisStore(
    (state) => state.commentAutomationReplyStats,
  )

  return (
    <AreaChart
      data={replyStats.map((row) => ({
        label: formatShortDate(new Date(row.dateReport), locale),
        value: row.count,
      }))}
      title={t("analytics.repliesToComments")}
      valueLabel={t("analytics.total")}
    />
  )
}
