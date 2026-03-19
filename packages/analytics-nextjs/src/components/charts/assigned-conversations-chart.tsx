"use client"

import { DonutChart } from "@aha.chat/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"

export function AssignedConversationsChart() {
  const t = useTranslations()
  return (
    <DonutChart
      data={[
        { name: "A", value: 400 },
        { name: "B", value: 300 },
        { name: "C", value: 300 },
        { name: "D", value: 200 },
      ]}
      helpText={t("analytics.assignedConversations.helpText")}
      title={t("analytics.assignedConversations.title")}
      valueLabel={t("analytics.conversations")}
    />
  )
}
