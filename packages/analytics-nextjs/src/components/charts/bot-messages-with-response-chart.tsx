"use client"

import BarChart from "@aha.chat/ui/components/charts/bar-chart"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function BotMessagesWithResponseChart() {
  const t = useTranslations()

  const botMessagesWithResponse = useAnalysisStore(
    (state) => state.botMessagesWithResponse,
  )

  const data = useMemo(() => {
    type Group = {
      name: string
      count: number
      // Used only for stable ordering regardless of insertion order.
      firstTimestamp: number
    }

    const groupedByDate = new Map<string, Group>()

    for (const item of botMessagesWithResponse) {
      const date = new Date(item.timestamp)
      const timestampMs = date.getTime()
      const name = format(date, "MMM d")

      const existing = groupedByDate.get(name)
      if (!existing) {
        groupedByDate.set(name, {
          name,
          count: 0,
          firstTimestamp: timestampMs,
        })
      }

      const group = groupedByDate.get(name)
      if (!group) {
        continue
      }

      group.firstTimestamp = Math.min(group.firstTimestamp, timestampMs)
      group.count += item.count
    }

    return Array.from(groupedByDate.values())
      .sort((a, b) => a.firstTimestamp - b.firstTimestamp)
      .map((group) => ({
        name: group.name,
        value: [
          {
            label: t("analytics.botMessagesWithResponse"),
            value: group.count,
          },
        ],
      }))
  }, [botMessagesWithResponse, t])

  return <BarChart data={data} title={t("analytics.botMessagesWithResponse")} />
}
