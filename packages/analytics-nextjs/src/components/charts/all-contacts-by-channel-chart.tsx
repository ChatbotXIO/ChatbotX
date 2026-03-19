"use client"

import { DonutChart } from "@aha.chat/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"

export function AllContactsByChannelChart() {
  const t = useTranslations()

  return (
    <DonutChart
      data={[
        { name: "A", value: 400 },
        { name: "B", value: 300 },
        { name: "C", value: 300 },
        { name: "D", value: 200 },
      ]}
      title={t("analytics.allContactsByChannel")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
