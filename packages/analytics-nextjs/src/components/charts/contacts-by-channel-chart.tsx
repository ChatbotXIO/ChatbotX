"use client"

import { DonutChart } from "@aha.chat/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function ContactsByChannelChart() {
  const t = useTranslations()
  const contactsByChannel = useAnalysisStore((state) => state.contactsByChannel)

  const data = useMemo(() => {
    return contactsByChannel.map((item) => ({
      name: item.dimension || "Unknown",
      value: item.uniqueContacts,
    }))
  }, [contactsByChannel])

  return (
    <DonutChart
      data={data}
      title={t("analytics.newContactsByChannel")}
      valueLabel={t("analytics.contacts")}
    />
  )
}
