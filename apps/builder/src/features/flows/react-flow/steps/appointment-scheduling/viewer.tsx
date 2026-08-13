"use client"

import type { AppointmentSchedulingStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { CalendarClockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAppointmentCalendarStore } from "@/features/appointment-calendars/provider/appointment-calendar-store-context"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

export function AppointmentSchedulingStepViewer({
  data,
}: {
  data: AppointmentSchedulingStepSchema
}) {
  const t = useTranslations()
  const calendar = useAppointmentCalendarStore((state) =>
    state.appointmentCalendars.find((item) => item.id === data.calendarId),
  )

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer
            icon={CalendarClockIcon}
            title={t("flows.actions.appointmentScheduling")}
          />
          <div className="mt-1 text-muted-foreground text-xs">
            {t(`appointmentScheduling.flowModes.${data.mode}`)}
            {calendar ? ` · ${calendar.name}` : ""}
          </div>
        </div>
        <div className="my-2 mr-3 flex flex-col gap-1">
          {data.states.map((state) => (
            <BaseStateViewer data={state} key={state.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
