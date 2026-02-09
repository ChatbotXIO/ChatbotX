"use client"

import { format, subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import BarChart from "@/components/charts/bar-chart"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

interface ConversationsMovedChartProps {
  chatbotId: string
}

export function ConversationsMovedChart({
  chatbotId,
}: ConversationsMovedChartProps) {
  const t = useTranslations()
  const [data, setData] = useState<
    Array<{ name: string; value: Array<{ label: string; value: number }> }>
  >([])
  const [loading, setLoading] = useState(true)

  const from = useAnalysisStore((state) => state.from)
  const to = useAnalysisStore((state) => state.to)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const toDate = to ? new Date(to) : new Date()
        const fromDate = from ? new Date(from) : subDays(toDate, 7)

        const params = new URLSearchParams({
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        })

        const response = await fetch(
          `/api/chatbots/${chatbotId}/analytics/conversation-handoffs?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch")
        }

        const result = (await response.json()) as Array<{
          chatbotId: string
          timestamp: string
          direction: "to_human" | "to_bot"
          count: number
        }>

        const groupedByDate = new Map<
          string,
          { to_human: number; to_bot: number }
        >()

        for (const item of result) {
          const dateKey = format(new Date(item.timestamp), "MMM d")
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

        const chartData = Array.from(groupedByDate.entries()).map(
          ([date, counts]) => ({
            name: date,
            value: [
              {
                label: t("analytics.human"),
                value: counts.to_human,
              },
              {
                label: t("analytics.bot"),
                value: counts.to_bot,
              },
            ],
          }),
        )

        setData(chartData)
      } catch (error) {
        console.error("Failed to fetch conversation handoffs:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [chatbotId, from, to, t])

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <BarChart
      data={data}
      name={t("analytics.conversationsMovedToHumanOrBot")}
    />
  )
}
