"use client"

import { DonutChart } from "@aha.chat/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"

export function UniqueConversationsByAdminChart() {
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
      helpText={t("analytics.uniqueConversationsByAdminsHelp")}
      title={t("analytics.uniqueConversationsByAdmins")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
