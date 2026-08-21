"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { AppTab } from "@/components/app-tab"
import { useWorkspaceId } from "@/hooks/routing"

export function AppointmentCalendarsTab() {
  const t = useTranslations()
  const pathname = usePathname()
  const workspaceId = useWorkspaceId()

  const calendarsPath = `/space/${workspaceId}/appointment-calendars`
  const appointmentsPath = `${calendarsPath}/appointments`
  const externalPath = `${calendarsPath}/external`

  const tabs = [
    {
      label: t("appointmentCalendars.tabs.calendars"),
      href: calendarsPath,
      isActive:
        pathname.startsWith(calendarsPath) &&
        !pathname.startsWith(appointmentsPath) &&
        !pathname.startsWith(externalPath),
    },
    {
      label: t("appointmentCalendars.tabs.appointments"),
      href: appointmentsPath,
      isActive: pathname.startsWith(appointmentsPath),
    },
    {
      label: t("appointmentCalendars.tabs.externalCalendars"),
      href: externalPath,
      isActive: pathname.startsWith(externalPath),
    },
  ]

  return <AppTab tabs={tabs} />
}
