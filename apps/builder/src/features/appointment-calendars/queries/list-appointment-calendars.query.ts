import { appointmentCalendarService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListAppointmentCalendarsRequest } from "../schemas/query"

export async function listAppointmentCalendars(
  input: ListAppointmentCalendarsRequest,
) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await appointmentCalendarService.list({
    workspaceId: input.workspaceId,
    page: input.page,
    perPage: input.perPage,
    search: input.name ?? undefined,
    sort: input.sort,
  })
}
