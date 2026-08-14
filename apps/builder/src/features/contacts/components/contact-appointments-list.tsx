"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { CalendarClockIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import type { ContactAppointmentResource } from "@/features/appointments/schemas/resource"

const statusVariant = (status: ContactAppointmentResource["status"]) =>
  status === "scheduled" ? "secondary" : "outline"

const statusLabelKey = {
  scheduled: "statuses.scheduled",
  cancelled: "statuses.cancelled",
} as const satisfies Record<ContactAppointmentResource["status"], string>

export const ContactAppointmentsList = ({
  appointments,
}: {
  appointments: ContactAppointmentResource[]
}) => {
  const t = useTranslations("appointments")
  const formatter = useFormatter()

  if (appointments.length === 0) {
    return (
      <div className="px-2 text-muted-foreground text-sm">
        {t("messages.empty")}
      </div>
    )
  }

  return (
    <div className="grid gap-2 px-2 text-sm">
      {appointments.map((appointment) => (
        <div
          className="flex items-start gap-2 rounded-md border p-2"
          key={appointment.id}
        >
          <CalendarClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              {formatter.dateTime(new Date(appointment.startAt), {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: appointment.inviteeTimezone,
              })}
            </div>
            <div className="truncate text-muted-foreground">
              {appointment.calendarName}
            </div>
          </div>
          <Badge
            className="shrink-0"
            variant={statusVariant(appointment.status)}
          >
            {t(statusLabelKey[appointment.status])}
          </Badge>
        </div>
      ))}
    </div>
  )
}
