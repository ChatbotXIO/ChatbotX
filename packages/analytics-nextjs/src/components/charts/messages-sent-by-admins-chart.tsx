"use client"

import { RadarChart } from "@aha.chat/ui/components/charts/radar-chart"
import { useTranslations } from "next-intl"

export function MessagesSentByAdminsChart() {
  const t = useTranslations()
  return (
    <RadarChart
      data={[
        { name: "Member 1", value: 120 },
        { name: "Member 2", value: 200 },
        { name: "Member 3", value: 150 },
        { name: "Member 4", value: 280 },
        { name: "Member 5", value: 100 },
        { name: "Member 6", value: 220 },
      ]}
      helpText={t("analytics.messagesSentByAdminsHelp")}
      title={t("analytics.messagesSentByAdmins")}
      valueLabel={t("analytics.messages")}
    />
  )
}
