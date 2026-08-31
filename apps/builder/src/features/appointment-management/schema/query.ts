import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const appointmentManagementTabs = ["next", "past"] as const
export type AppointmentManagementTab =
  (typeof appointmentManagementTabs)[number]

export const normalizeAppointmentManagementTab = (
  value?: string | null,
): AppointmentManagementTab => (value === "past" ? "past" : "next")

export const listAppointmentsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  tab: parseAsString.withDefault("next"),
}

export const listAppointmentsSearchParamsCache = createSearchParamsCache(
  listAppointmentsSearchParams,
)

export type ListAppointmentsRequest = Omit<
  Awaited<ReturnType<typeof listAppointmentsSearchParamsCache.parse>>,
  "tab"
> & {
  workspaceId: string
  calendarId?: string
  tab: AppointmentManagementTab
}
