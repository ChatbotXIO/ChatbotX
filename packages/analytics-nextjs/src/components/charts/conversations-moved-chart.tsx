"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { eachDayOfInterval, format } from "date-fns"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ConversationsMovedChart() {
  const t = useTranslations()
  const conversationHandoffs = useAnalysisStore(
    (state) => state.conversationHandoffs,
  )
  const from = useAnalysisStore((state) => state.from)
  const to = useAnalysisStore((state) => state.to)

  const data = useMemo(() => {
    const groupedByDate = new Map<
      string,
      {
        to_human: number
        to_bot: number
      }
    >()

    for (const item of conversationHandoffs) {
      const dateKey = format(new Date(item.timestamp), "MMM d, yyyy")
      const existing = groupedByDate.get(dateKey) || {
        to_human: 0,
        to_bot: 0,
      }

      if (item.direction === "to_human") {
        existing.to_human += item.count
      } else if (item.direction === "to_bot") {
        existing.to_bot += item.count
      }

      groupedByDate.set(dateKey, existing)
    }

    const allDates = eachDayOfInterval({ start: from, end: to })

    return allDates.map((date) => {
      const dateKey = format(date, "MMM d, yyyy")
      const counts = groupedByDate.get(dateKey) || {
        to_human: 0,
        to_bot: 0,
      }
      return {
        name: dateKey,
        value: [
          { label: t("analytics.human"), value: counts.to_human },
          { label: t("analytics.bot"), value: counts.to_bot },
        ],
      }
    })
  }, [conversationHandoffs, from, to, t])

  return (
    <BarChart
      data={data}
      title={t("analytics.conversationsMovedToHumanOrBot")}
    />
  )
}
