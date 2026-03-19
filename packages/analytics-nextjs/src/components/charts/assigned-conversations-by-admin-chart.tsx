"use client"

import { DonutChart } from "@aha.chat/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"

export function AssignedConversationsByAdminChart() {
  const t = useTranslations()
  return (
    <DonutChart
      data={[
        { name: "A", value: 400 },
        { name: "B", value: 300 },
        { name: "C", value: 300 },
        { name: "D", value: 200 },
        {
          name: "E",
          value: 278,
        },
        { name: "F", value: 189 },
        { name: "G", value: 100 },
      ]}
      helpText={t("analytics.assignedConversationsByAdminsHelp")}
      title={t("analytics.assignedConversationsByAdmins")}
      valueLabel={t("analytics.conversations")}
    />
  )
}
