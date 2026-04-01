"use client"

import { RadarChart } from "@chatbotx.io/ui/components/charts/radar-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function MessagesSentByAdminsChart() {
  const t = useTranslations()
  const messagesByAdmin = useAnalysisStore((state) => state.messagesByAdmin)

  const data = useMemo(() => {
    return messagesByAdmin.map((stat) => ({
      name: stat.userName || stat.userEmail || stat.adminId,
      value: stat.count,
    }))
  }, [messagesByAdmin])

  return (
    <RadarChart
      data={data}
      helpText={t("analytics.messagesSentByAdminsHelp")}
      title={t("analytics.messagesSentByAdmins")}
      valueLabel={t("analytics.messages")}
    />
  )
}
