"use client"

import BarChart from "@aha.chat/ui/components/charts/bar-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ConversationsMovedChart() {
  const t = useTranslations()
  const conversationHandoffs = useAnalysisStore(
    (state) => state.conversationHandoffs,
  )

  const data = useMemo(() => {
    const groupedByDate = new Map<
      string,
      {
        to_human: number
        to_bot: number
        firstTimestampMs: number
      }
    >()

    for (const item of conversationHandoffs) {
      const timestampMs = new Date(item.timestamp).getTime()
      const dateKey = format(new Date(item.timestamp), "MMM d")
      const existing =
        groupedByDate.get(dateKey) ||
        ({
          to_human: 0,
          to_bot: 0,
          firstTimestampMs: timestampMs,
        } as {
          to_human: number
          to_bot: number
          firstTimestampMs: number
        })

      if (item.direction === "to_human") {
        existing.to_human += item.count
      } else if (item.direction === "to_bot") {
        existing.to_bot += item.count
      }

      groupedByDate.set(dateKey, {
        ...existing,
        firstTimestampMs: Math.min(existing.firstTimestampMs, timestampMs),
      })
    }

    return Array.from(groupedByDate.entries())
      .sort((a, b) => a[1].firstTimestampMs - b[1].firstTimestampMs)
      .map(([date, counts]) => ({
        name: date,
        value: [
          { label: t("analytics.human"), value: counts.to_human },
          { label: t("analytics.bot"), value: counts.to_bot },
        ],
      }))
  }, [conversationHandoffs, t])

  return (
    <BarChart
      data={data}
      title={t("analytics.conversationsMovedToHumanOrBot")}
    />
  )
}
