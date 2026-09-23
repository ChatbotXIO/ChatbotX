"use client"

import type { DashboardLoadStatus } from "@chatbotx.io/analytics-nextjs/provider/analysis-store"
import { useAnalysisStore } from "@chatbotx.io/analytics-nextjs/provider/analysis-store-context"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"

const isPending = (status: DashboardLoadStatus | undefined) =>
  status !== "success" && status !== "refreshing" && status !== "error"

const getKpiValue = (
  status: DashboardLoadStatus | undefined,
  value: number,
  errorMessage: string,
) => {
  if (status === "error") {
    return errorMessage
  }

  if (status === "success" || status === "refreshing") {
    return value.toLocaleString()
  }

  return "..."
}

export default function InboxStatsList() {
  const t = useTranslations()
  const totalContactsStatus = useAnalysisStore(
    (state) => state.dashboardLoadStatus.getInboxTotalContacts,
  )
  const newContactsStatus = useAnalysisStore(
    (state) => state.dashboardLoadStatus.getInboxNewContacts,
  )
  const activeContactsStatus = useAnalysisStore(
    (state) => state.dashboardLoadStatus.getInboxActiveContacts,
  )
  const totalContacts = useAnalysisStore((s) => s.inboxTotalContacts)
  const newContacts = useAnalysisStore((s) => s.inboxNewContacts)
  const activeContacts = useAnalysisStore((s) => s.inboxActiveContacts)

  const errorMessage = t("states.error")
  const cards = [
    {
      labelKey: "analytics.contacts" as const,
      status: totalContactsStatus,
      value: totalContacts,
    },
    {
      labelKey: "analytics.newContacts" as const,
      status: newContactsStatus,
      value: newContacts,
    },
    {
      labelKey: "analytics.activeContacts" as const,
      status: activeContactsStatus,
      value: activeContacts,
    },
  ]

  return (
    <div className="flex flex-wrap gap-4">
      {cards.map(({ labelKey, status, value }) => (
        <Card
          aria-busy={isPending(status)}
          className="flex-1 py-4"
          key={labelKey}
        >
          <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
            <h3 className="text-sm">{t(labelKey)}</h3>
            <p className="font-bold text-sm">
              {getKpiValue(status, value, errorMessage)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
