"use client"

import { format, subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import BarChart from "@/components/charts/bar-chart"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

interface NewContactsChartProps {
  chatbotId: string
}

export function NewContactsChart({ chatbotId }: NewContactsChartProps) {
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

        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const params = new URLSearchParams({
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          timezone,
          granularity: "day",
          eventTypes: "contact_created",
        })

        const response = await fetch(
          `/api/chatbots/${chatbotId}/analytics/contact-stats?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch")
        }

        const result = (await response.json()) as Array<{
          chatbotId: string
          timestamp: string
          eventType: string
          count: number
          uniqueContacts: number
        }>

        const chartData = result.map((item) => {
          return {
            name: format(new Date(item.timestamp), "MMM d"),
            value: [
              {
                label: t("analytics.contacts"),
                value: item.count,
              },
            ],
          }
        })

        setData(chartData)
      } catch (error) {
        console.error("Failed to fetch new contacts:", error)
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

  return <BarChart data={data} name={t("analytics.newContacts")} />
}
