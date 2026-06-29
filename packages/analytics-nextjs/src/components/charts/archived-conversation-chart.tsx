"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { eachDayOfInterval, format } from "date-fns"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatDateWithYear } from "../../utils/date-format"

export function ArchivedConversationChart() {
  const t = useTranslations()
  const locale = useLocale()
  const conversationArchived = useAnalysisStore(
    (state) => state.conversationArchived,
  )
  const from = useAnalysisStore((state) => state.from)
  const to = useAnalysisStore((state) => state.to)

  const data = useMemo(() => {
    const groupedByDate = new Map<string, number>()

    for (const stat of conversationArchived) {
      const dateKey = format(new Date(stat.timestamp), "yyyy-MM-dd")
      const existing = groupedByDate.get(dateKey) || 0
      groupedByDate.set(dateKey, existing + stat.count)
    }

    const allDates = eachDayOfInterval({ start: from, end: to })

    return allDates.map((date) => {
      const dateKey = format(date, "yyyy-MM-dd")
      const count = groupedByDate.get(dateKey) || 0
      return {
        name: formatDateWithYear(date, locale),
        value: [
          {
            label: t("analytics.conversations"),
            value: count,
          },
        ],
      }
    })
  }, [conversationArchived, from, to, locale, t])

  return <BarChart data={data} title={t("analytics.archivedConversations")} />
}
