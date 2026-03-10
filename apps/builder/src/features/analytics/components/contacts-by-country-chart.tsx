"use client"

import { subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { DonutChart } from "@/components/charts/donut-chart"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

interface ContactsByCountryChartProps {
  chatbotId: string
}

export function ContactsByCountryChart({
  chatbotId,
}: ContactsByCountryChartProps) {
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

        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const params = new URLSearchParams({
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          timezone,
          dimension: "country",
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
        console.error("Failed to fetch contacts by country:", error)
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
      name={t("analytics.newContactsByCountry")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
