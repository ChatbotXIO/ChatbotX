"use client"

import BarChart from "@aha.chat/ui/components/charts/bar-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function BotMessagesByResultChart() {
  const t = useTranslations()
  const { botMessagesByResult } = useAnalysisStore((state) => state)

  const data = useMemo(() => {
    const successLabel = t("analytics.success")
    const fallbackLabel = t("analytics.fallback")

    type Group = {
      name: string
      success: number
      fallback: number
      // Used only for stable ordering regardless of insertion order.
      firstTimestamp: number
    }

    const groupedByDate = new Map<string, Group>()

    for (const item of botMessagesByResult) {
      const date = new Date(item.timestamp)
      const timestampMs = date.getTime()
      const name = format(date, "MMM d")

      const existing = groupedByDate.get(name)
      if (!existing) {
        groupedByDate.set(name, {
          name,
          success: 0,
          fallback: 0,
          firstTimestamp: timestampMs,
        })
      }

      const group = groupedByDate.get(name)
      if (!group) {
        continue
      }

      // Update firstTimestamp in case out-of-order items come in.
      group.firstTimestamp = Math.min(group.firstTimestamp, timestampMs)

      if (item.result === "SUCCESS") {
        group.success += item.count
      } else if (item.result === "FALLBACK") {
        group.fallback += item.count
      }
    }

    return Array.from(groupedByDate.values())
      .sort((a, b) => a.firstTimestamp - b.firstTimestamp)
      .map((group) => ({
        name: group.name,
        value: [
          {
            label: successLabel,
            value: group.success,
          },
          {
            label: fallbackLabel,
            value: group.fallback,
          },
        ],
      }))
  }, [botMessagesByResult, t])

  return <BarChart data={data} title={t("analytics.botMessagesByResult")} />
}
