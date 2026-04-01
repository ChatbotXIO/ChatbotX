"use client"

import { DonutChart } from "@chatbotx.io/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function AllContactsByChannelChart() {
  const t = useTranslations()
  const { contactsByChannel } = useAnalysisStore((state) => state)

  const data = useMemo(() => {
    return contactsByChannel.map((item) => ({
      name: item.dimension || "Unknown",
      value: item.uniqueContacts,
    }))
  }, [contactsByChannel])

  return (
    <DonutChart
      data={data}
      title={t("analytics.allContactsByChannel")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
