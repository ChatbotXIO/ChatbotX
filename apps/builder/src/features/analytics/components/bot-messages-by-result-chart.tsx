"use client"

import { format, subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import BarChart from "@/components/charts/bar-chart"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

interface BotMessagesByResultChartProps {
  chatbotId: string
}

export function BotMessagesByResultChart({
  chatbotId,
}: BotMessagesByResultChartProps) {
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
          `/api/chatbots/${chatbotId}/analytics/bot-messages-by-result?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch")
        }

        const result = (await response.json()) as Array<{
          chatbotId: string
          timestamp: string
          hasResponse: boolean
          responseType: string
          result?: string
          aiProvider: string
          count: number
        }>

        const groupedByDate = new Map<
          string,
          { success: number; fallback: number }
        >()

        for (const item of result) {
          const dateKey = format(new Date(item.timestamp), "MMM d")
          const existing = groupedByDate.get(dateKey) || {
            success: 0,
            fallback: 0,
          }

          if (item.result === "success") {
            existing.success += item.count
          } else if (item.result === "fallback") {
            existing.fallback += item.count
          }

          groupedByDate.set(dateKey, existing)
        }

        const chartData = Array.from(groupedByDate.entries()).map(
          ([date, counts]) => ({
            name: date,
            value: [
              {
                label: t("analytics.success"),
                value: counts.success,
              },
              {
                label: t("analytics.fallback"),
                value: counts.fallback,
              },
            ],
          }),
        )

        setData(chartData)
      } catch (error) {
        console.error("Failed to fetch bot messages by result:", error)
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

  return <BarChart data={data} name={t("analytics.botMessagesByResult")} />
}
