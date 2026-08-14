import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { AppointmentsTable } from "@/features/appointment-management/components/appointments-table"
import { listAppointments } from "@/features/appointment-management/queries"
import {
  listAppointmentsSearchParamsCache,
  normalizeAppointmentManagementTab,
} from "@/features/appointment-management/schemas/query"

export default async function AppointmentsPage({
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
    listAppointmentsSearchParamsCache.parse(await searchParams),
  ])
  const tab = normalizeAppointmentManagementTab(search.tab)
  const promises = Promise.all([
    listAppointments({ ...search, tab, workspaceId }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("appointmentCalendars.title"),
            href: `/space/${workspaceId}/appointment-calendars`,
          },
          { label: t("appointmentManagement.title"), href: "" },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <AppointmentsTable
          promises={promises}
          tab={tab}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
