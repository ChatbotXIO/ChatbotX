"use client"

import BarChart from "@chatbotx.io/ui/components/charts/bar-chart"
import { useTranslations } from "next-intl"

export function AvgConversationDurationChart() {
  const t = useTranslations()

  return (
    <BarChart
      data={[
        {
          name: "Jan 7",
          value: [
            {
              label: t("fields.value.label"),
              value: 4000,
            },
          ],
        },
        {
          name: "Jan 8",
          value: [
            {
              label: t("fields.value.label"),
              value: 3000,
            },
          ],
        },
        {
          name: "Jan 9",
          value: [
            {
              label: t("fields.value.label"),
              value: 2000,
            },
          ],
        },
        {
          name: "Jan 10",
          value: [
            {
              label: t("fields.value.label"),
              value: 2780,
            },
          ],
        },
        {
          name: "Jan 11",
          value: [
            {
              label: t("fields.value.label"),
              value: 1890,
            },
          ],
        },
      ]}
      helpText={t("analytics.averageDurationOfConversationHelp")}
      title={t("analytics.averageDurationOfConversation")}
    />
  )
}
