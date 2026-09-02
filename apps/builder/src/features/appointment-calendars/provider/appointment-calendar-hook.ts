import { useMemo } from "react"
import { useAppointmentCalendarStore } from "./appointment-calendar-store-context"

export const useAppointmentCalendarSelectOptions = (): {
  label: string
  value: string
}[] => {
  const appointmentCalendars = useAppointmentCalendarStore(
    (state) => state.appointmentCalendars,
  )

  return useMemo(
    () =>
      appointmentCalendars.map((calendar) => ({
        label: calendar.name,
        value: calendar.id,
      })),
    [appointmentCalendars],
  )
}
