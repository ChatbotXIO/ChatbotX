"use client"

import { subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { DonutChart } from "@/components/charts/donut-chart"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

interface MessagesBySenderChartProps {
  chatbotId: string
}

export function MessagesBySenderChart({
  chatbotId,
}: MessagesBySenderChartProps) {
  const t = useTranslations()
  const [data, setData] = useState<Array<{ name: string; value: number }>>([])
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
          `/api/chatbots/${chatbotId}/analytics/messages-by-sender?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch")
        }

        const result = (await response.json()) as Array<{
          chatbotId: string
          timestamp: string
          channel: string
          senderType: "bot" | "human"
          count: number
        }>

        const getChannelLabel = (channel: string): string => {
          const labels: Record<string, string> = {
            messenger: "Messenger",
            whatsapp: "WhatsApp",
            webchat: "Webchat",
            zalo: "Zalo",
          }
          return labels[channel] || channel
        }

        const totals = new Map<string, number>()

        for (const item of result) {
          const channelLabel = getChannelLabel(item.channel)
          const senderLabel =
            item.senderType === "bot"
              ? t("analytics.bot")
              : t("analytics.human")
          const key = `${channelLabel} - ${senderLabel}`

          totals.set(key, (totals.get(key) || 0) + item.count)
        }

        const chartData = Array.from(totals.entries()).map(([name, value]) => ({
          name,
          value,
        }))

        setData(chartData)
      } catch (error) {
        console.error("Failed to fetch messages by sender:", error)
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
    <DonutChart
      data={data}
      name={t("analytics.messagesSentByHumanOrBot")}
      valueLabel={t("analytics.messages")}
    />
  )
}
