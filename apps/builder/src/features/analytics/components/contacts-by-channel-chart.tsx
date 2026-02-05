"use client"

import { subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { DonutChart } from "@/components/charts/donut-chart"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

interface ContactsByChannelChartProps {
  chatbotId: string
}

export function ContactsByChannelChart({
  chatbotId,
}: ContactsByChannelChartProps) {
  const t = useTranslations()
  const [data, setData] = useState<Array<{ name: string; value: number }>>([])
  const [loading, setLoading] = useState(true)

  const from = useAnalysisStore((state) => state.from)
  const to = useAnalysisStore((state) => state.to)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const toDate = to ? new Date(to) : new Date()
        const fromDate = from ? new Date(from) : subDays(toDate, 30)

        const params = new URLSearchParams({
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          dimension: "channel",
        })

        const response = await fetch(
          `/api/chatbots/${chatbotId}/analytics/contacts-by-dimension?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch")
        }

        const result = (await response.json()) as Array<{
          dimension: string
          count: number
          uniqueContacts: number
        }>

        const chartData = result.map((item) => {
          return {
            name: item.dimension || "Unknown",
            value: item.uniqueContacts,
          }
        })

        setData(chartData)
      } catch (error) {
        console.error("Failed to fetch contacts by channel:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [chatbotId, from, to])

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
      name={t("analytics.newContactsByChannel")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
