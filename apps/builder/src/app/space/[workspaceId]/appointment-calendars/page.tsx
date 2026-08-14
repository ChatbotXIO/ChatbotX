import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { AppointmentCalendarsTable } from "@/features/appointment-calendars/components/appointment-calendars-table"
import { listAppointmentCalendars } from "@/features/appointment-calendars/queries"
import { listAppointmentCalendarsSearchParamsCache } from "@/features/appointment-calendars/schemas/query"

export default async function AppointmentCalendarsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const [t, search] = await Promise.all([
    getTranslations(),
    listAppointmentCalendarsSearchParamsCache.parse(await searchParams),
  ])
  const promises = Promise.all([
    listAppointmentCalendars({ ...search, workspaceId }),
  ])
  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("appointmentCalendars.title"), href: "" },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <AppointmentCalendarsTable
          promises={promises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
