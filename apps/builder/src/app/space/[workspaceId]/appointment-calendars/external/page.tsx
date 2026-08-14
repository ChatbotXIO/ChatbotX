import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { ExternalCalendarsTable } from "@/features/external-calendars/components/external-calendars-table"
import { listExternalCalendars } from "@/features/external-calendars/queries"

export default async function ExternalCalendarsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const t = await getTranslations()
  const promises = Promise.all([listExternalCalendars({ workspaceId })])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("appointmentCalendars.title"),
            href: `/space/${workspaceId}/appointment-calendars`,
          },
          { label: t("externalCalendars.title"), href: "" },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <ExternalCalendarsTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
