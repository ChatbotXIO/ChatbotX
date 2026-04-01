"use client"

import { DonutChart } from "@chatbotx.io/ui/components/charts/donut-chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

export function AssignedConversationsByAdminChart() {
  const t = useTranslations()
  const conversationAssignedByAdmin = useAnalysisStore(
    (state) => state.conversationAssignedByAdmin,
  )

  const data = useMemo(() => {
    return conversationAssignedByAdmin.map((stat) => ({
      name: stat.userName || stat.userEmail || stat.toAssignee,
      value: stat.count,
    }))
  }, [conversationAssignedByAdmin])

  return (
    <DonutChart
      data={data}
      helpText={t("analytics.assignedConversationsByAdminsHelp")}
      title={t("analytics.assignedConversationsByAdmins")}
      valueLabel={t("analytics.conversations")}
    />
  )
}
