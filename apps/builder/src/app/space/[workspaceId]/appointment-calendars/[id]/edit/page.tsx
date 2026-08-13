import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { EditAppointmentCalendarForm } from "@/features/appointment-calendars/components/edit-appointment-calendar-form"
import { getAppointmentCalendar } from "@/features/appointment-calendars/queries"
import { listExternalCalendarsForSelect } from "@/features/external-calendars/queries"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function EditAppointmentCalendarPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }
  const [t, calendar, externalCalendars] = await Promise.all([
    getTranslations(),
    getAppointmentCalendar({ workspaceId, id }),
    listExternalCalendarsForSelect({ workspaceId }),
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
          { label: calendar.name, href: "" },
        ]}
      />
      <FlowStoreProvider workspaceId={workspaceId}>
        <EditAppointmentCalendarForm
          calendar={calendar}
          externalCalendarOptions={externalCalendars.map((connection) => ({
            label: connection.label,
            value: connection.id,
          }))}
          workspaceId={workspaceId}
        />
      </FlowStoreProvider>
    </div>
  )
}
