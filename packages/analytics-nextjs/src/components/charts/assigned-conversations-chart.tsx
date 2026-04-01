"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { eachDayOfInterval, format } from "date-fns"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function AssignedConversationsChart() {
  const t = useTranslations()
  const conversationAssigned = useAnalysisStore(
    (state) => state.conversationAssigned,
  )
  const from = useAnalysisStore((state) => state.from)
  const to = useAnalysisStore((state) => state.to)

  const data = useMemo(() => {
    const groupedByDate = new Map<string, number>()

    for (const stat of conversationAssigned) {
      const dateKey = format(new Date(stat.timestamp), "MMM d, yyyy")
      const existing = groupedByDate.get(dateKey) || 0
      groupedByDate.set(dateKey, existing + stat.count)
    }

    const allDates = eachDayOfInterval({ start: from, end: to })

    return allDates.map((date) => {
      const dateKey = format(date, "MMM d, yyyy")
      const count = groupedByDate.get(dateKey) || 0
      return {
        name: dateKey,
        value: [
          {
            label: t("analytics.conversations"),
            value: count,
          },
        ],
      }
    })
  }, [conversationAssigned, from, to, t])

  return (
    <BarChart
      data={data}
      helpText={t("analytics.assignedConversations.helpText")}
      title={t("analytics.assignedConversations.title")}
    />
  )
}
