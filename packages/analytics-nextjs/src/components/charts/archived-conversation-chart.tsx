"use client"

import BarChart from "@aha.chat/ui/components/charts/bar-chart"
import { useTranslations } from "next-intl"

export function ArchivedConversationChart() {
  const t = useTranslations()
  return (
    <BarChart
      data={[
        {
          name: "Jan 7",
          value: [
            {
              label: t("analytics.conversations"),
              value: 1,
            },
          ],
        },
        {
          name: "Jan 8",
          value: [
            {
              label: t("analytics.conversations"),
              value: 2,
            },
          ],
        },
        {
          name: "Jan 9",
          value: [
            {
              label: t("analytics.conversations"),
              value: 0,
            },
          ],
        },
        {
          name: "Jan 10",
          value: [
            {
              label: t("analytics.conversations"),
              value: 3,
            },
          ],
        },
        {
          name: "Jan 11",
          value: [
            {
              label: t("analytics.conversations"),
              value: 1,
            },
          ],
        },
      ]}
      title={t("analytics.archivedConversations")}
    />
  )
}
