"use client"

import { useAnalysisStore } from "@chatbotx.io/analytics-nextjs/provider/analysis-store-context"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"

type DashboardKpiStatus = "queued" | "loading" | "success" | "error" | undefined

const getKpiValue = (
  status: DashboardKpiStatus,
  value: number,
  errorMessage: string,
) => {
  if (status === "error") {
    return errorMessage
  }

  if (status !== "success") {
    return "..."
  }

  return value.toLocaleString()
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

  const totalContactsPending =
    totalContactsStatus !== "success" && totalContactsStatus !== "error"
  const newContactsPending =
    newContactsStatus !== "success" && newContactsStatus !== "error"
  const activeContactsPending =
    activeContactsStatus !== "success" && activeContactsStatus !== "error"
  const errorMessage = t("states.error")

  return (
    <div className="flex flex-wrap gap-4">
      <Card aria-busy={totalContactsPending} className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.contacts")}</h3>
          <p aria-busy={totalContactsPending} className="font-bold text-sm">
            {getKpiValue(totalContactsStatus, totalContacts, errorMessage)}
          </p>
        </CardContent>
      </Card>

      <Card aria-busy={newContactsPending} className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.newContacts")}</h3>
          <p aria-busy={newContactsPending} className="font-bold text-sm">
            {getKpiValue(newContactsStatus, newContacts, errorMessage)}
          </p>
        </CardContent>
      </Card>

      <Card aria-busy={activeContactsPending} className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.activeContacts")}</h3>
          <p aria-busy={activeContactsPending} className="font-bold text-sm">
            {getKpiValue(activeContactsStatus, activeContacts, errorMessage)}
          </p>
        </CardContent>
      </Card>

      {/* <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.responseTime")}</h3>
          <p className="font-bold text-sm">{t("analytics.comingSoon")}</p>
        </CardContent>
      </Card>

      <Card className="flex-1 py-4">
        <CardContent className="flex flex-col items-center justify-center gap-2 px-4">
          <h3 className="text-sm">{t("analytics.firstResponseTime")}</h3>
          <p className="font-bold text-sm">{t("analytics.comingSoon")}</p>
        </CardContent>
      </Card> */}
    </div>
  )
}
