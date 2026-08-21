import type { ReactNode } from "react"
import { AppointmentCalendarsTab } from "@/features/appointment-calendars/components/appointment-calendars-tab"

export default function AppointmentCalendarsLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <AppointmentCalendarsTab />
      {children}
    </div>
  )
}
