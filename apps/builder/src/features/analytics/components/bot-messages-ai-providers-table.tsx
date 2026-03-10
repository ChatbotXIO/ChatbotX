"use client"

import { subDays } from "date-fns"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useAnalysisStore } from "@/features/analysis/provider/analysis-store-context"

interface BotMessagesAIProvidersTableProps {
  chatbotId: string
}

export function BotMessagesAIProvidersTable({
  chatbotId,
}: BotMessagesAIProvidersTableProps) {
  const t = useTranslations()
  const [data, setData] = useState<
    Array<{
      aiProvider: string
      count: number
      percentage: number
    }>
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
        })

        const response = await fetch(
          `/api/chatbots/${chatbotId}/analytics/bot-messages-ai-providers?${params}`,
        )

        if (!response.ok) {
          throw new Error("Failed to fetch")
        }

        const result = (await response.json()) as Array<{
          aiProvider: string
          count: number
          percentage: number
        }>

        setData(result)
      } catch (error) {
        console.error("Failed to fetch AI provider stats:", error)
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
    <div className="rounded-md border">
      <table className="w-full">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-sm">
              {t("analytics.aiProvider")}
            </th>
            <th className="px-4 py-3 text-right font-medium text-sm">
              {t("analytics.responseCount")}
            </th>
            <th className="px-4 py-3 text-right font-medium text-sm">
              {t("analytics.percentage")}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                className="px-4 py-8 text-center text-muted-foreground text-sm"
                colSpan={3}
              >
                No data
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr className="border-b last:border-0" key={row.aiProvider}>
                <td className="px-4 py-3 font-medium text-sm capitalize">
                  {row.aiProvider}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {row.count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  {row.percentage.toFixed(1)}%
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
