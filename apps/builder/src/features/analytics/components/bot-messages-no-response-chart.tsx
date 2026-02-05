"use client"

import { format, subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import BarChart from "@/components/charts/bar-chart"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

interface BotMessagesNoResponseChartProps {
  chatbotId: string
}

export function BotMessagesNoResponseChart({
  chatbotId,
}: BotMessagesNoResponseChartProps) {
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
          granularity: "day",
        })

        const response = await fetch(
          `/api/chatbots/${chatbotId}/analytics/bot-messages-no-response?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch")
        }

        const result = (await response.json()) as Array<{
          chatbotId: string
          timestamp: string
          hasResponse: boolean
          responseType: string
          aiProvider: string
          count: number
        }>

        const groupedByDate = new Map<string, number>()

        for (const item of result) {
          const dateKey = format(new Date(item.timestamp), "MMM d")
          const existing = groupedByDate.get(dateKey) || 0
          groupedByDate.set(dateKey, existing + item.count)
        }

        const chartData = Array.from(groupedByDate.entries()).map(
          ([date, count]) => ({
            name: date,
            value: [
              {
                label: t("analytics.botMessagesNoResponse"),
                value: count,
              },
            ],
          }),
        )

        setData(chartData)
      } catch (error) {
        console.error("Failed to fetch bot messages with no response:", error)
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

  return <BarChart data={data} name={t("analytics.botMessagesNoResponse")} />
}
