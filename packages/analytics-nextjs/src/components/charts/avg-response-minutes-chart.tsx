"use client"

import BarChart from "@aha.chat/ui/components/charts/bar-chart"
import { useTranslations } from "next-intl"

export function AvgResponseMinutesChart() {
  const t = useTranslations()

  return (
    <BarChart
      data={[
        {
          name: "Jan 7",
          value: [
            {
              label: t("analytics.firstResponseTime"),
              value: 4000,
            },
            {
              label: t("analytics.responseTime"),
              value: 2400,
            },
          ],
        },
        {
          name: "Jan 8",
          value: [
            {
              label: t("analytics.firstResponseTime"),
              value: 3000,
            },
            {
              label: t("analytics.responseTime"),
              value: 1398,
            },
          ],
        },
        {
          name: "Jan 9",
          value: [
            {
              label: t("analytics.firstResponseTime"),
              value: 2000,
            },
            {
              label: t("analytics.responseTime"),
              value: 9800,
            },
          ],
        },
        {
          name: "Jan 10",
          value: [
            {
              label: t("analytics.firstResponseTime"),
              value: 2780,
            },
            {
              label: t("analytics.responseTime"),
              value: 3908,
            },
          ],
        },
        {
          name: "Jan 11",
          value: [
            {
              label: t("analytics.firstResponseTime"),
              value: 1890,
            },
            {
              label: t("analytics.responseTime"),
              value: 4800,
            },
          ],
        },
      ]}
      helpText={t("analytics.averageResponseTimeHelp")}
      title={t("analytics.averageResponseTime")}
    />
  )
}
