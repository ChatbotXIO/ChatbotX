"use client"

import { DonutChart } from "@aha.chat/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function MessagesBySenderChart() {
  const t = useTranslations()
  const messagesBySender = useAnalysisStore((state) => state.messagesBySender)

  const data = useMemo(() => {
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

    for (const item of messagesBySender) {
      const channelLabel = getChannelLabel(item.channel)
      const senderLabel =
        item.senderType === "bot" ? t("analytics.bot") : t("analytics.human")

      const key = `${channelLabel} - ${senderLabel}`
      totals.set(key, (totals.get(key) || 0) + item.count)
    }

    return Array.from(totals.entries()).map(([name, value]) => ({
      name,
      value,
    }))
  }, [messagesBySender, t])

  return (
    <DonutChart
      data={data}
      title={t("analytics.messagesSentByHumanOrBot")}
      valueLabel={t("analytics.messages")}
    />
  )
}
