"use client"

import { DonutChart } from "@chatbotx.io/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function AllContactsByChannelChart() {
  const t = useTranslations()
  const allContactsByChannel = useAnalysisStore(
    (state) => state.allContactsByChannel,
  )

  const data = useMemo(
    () =>
      allContactsByChannel.map((item) => ({
        name: item.dimension || t("analytics.unknown"),
        value: item.uniqueContacts,
      })),
    [allContactsByChannel, t],
  )

  return (
    <DonutChart
      data={data}
      noDataLabel={t("analytics.noData")}
      title={t("analytics.allContactsByChannel")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
