"use client"

import AreaChart from "@chatbotx.io/ui/components/charts/area-chart"
import { useLocale, useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatTimeRangeDate } from "../../utils/date-format"

export function CommentAutomationRepliesChart() {
  const t = useTranslations()
  const locale = useLocale()

  const replyStats = useAnalysisStore(
    (state) => state.commentAutomationReplyStats,
  )
  const from = useAnalysisStore((state) => state.from)
  const to = useAnalysisStore((state) => state.to)

  return (
    <AreaChart
      // The series switches to monthly buckets past 60 days (the range filter
      // is unbounded), so the labels follow the same threshold — the raw key is
      // passed through, never `new Date(...)`, to keep it a local calendar day.
      data={replyStats.map((row) => ({
        label: formatTimeRangeDate(row.dateReport, from, to, locale),
        value: row.count,
      }))}
      title={t("analytics.repliesToComments")}
      valueLabel={t("analytics.total")}
    />
  )
}
