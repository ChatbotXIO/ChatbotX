"use client"

import { DonutChart } from "@chatbotx.io/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function UniqueConversationsByAdminChart() {
  const t = useTranslations()
  const uniqueConversationsByAdmin = useAnalysisStore(
    (state) => state.uniqueConversationsByAdmin,
  )

  const data = useMemo(() => {
    return uniqueConversationsByAdmin.map((stat) => ({
      name: stat.userName || stat.userEmail || stat.toAssignee,
      value: stat.count,
    }))
  }, [uniqueConversationsByAdmin])

  return (
    <DonutChart
      data={data}
      helpText={t("analytics.uniqueConversationsByAdminsHelp")}
      title={t("analytics.uniqueConversationsByAdmins")}
      valueLabel={t("analytics.conversations")}
    />
  )
}
