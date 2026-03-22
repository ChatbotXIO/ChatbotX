"use client"

import { RadarChart } from "@aha.chat/ui/components/charts/radar-chart"
import { useTranslations } from "next-intl"

export function AvgFirstResponseMinutesByAdminChart() {
  const t = useTranslations()

  return (
    <RadarChart
      data={[
        { name: "Member 1", value: 20 },
        { name: "Member 2", value: 200 },
        { name: "Member 3", value: 300 },
        { name: "Member 4", value: 500 },
        { name: "Member 5", value: 1000 },
        { name: "Member 6", value: 2000 },
      ]}
      helpText={t("analytics.averageFirstResponseTimeByAdminHelp")}
      title={t("analytics.averageFirstResponseTimeByAdmin")}
      valueLabel="Value"
    />
  )
}
