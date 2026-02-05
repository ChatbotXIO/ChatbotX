"use client"

import { format, subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import AreaChart from "@/components/charts/area-chart"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

interface TotalContactsChartProps {
  chatbotId: string
}

export function TotalContactsChart({ chatbotId }: TotalContactsChartProps) {
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
          `/api/chatbots/${chatbotId}/analytics/total-contacts?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch")
        }

        const result = (await response.json()) as Array<{
          day: string
          totalContacts: number
        }>

        const chartData = result.map((item) => {
          return {
            name: format(new Date(item.day), "MMM d"),
            value: item.totalContacts,
          }
        })

        setData(chartData)
      } catch (error) {
        console.error("Failed to fetch total contacts:", error)
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
    <AreaChart
      data={data}
      name={t("analytics.totalContacts")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
