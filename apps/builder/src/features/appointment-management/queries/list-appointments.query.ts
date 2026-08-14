import {
  appointmentService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListAppointmentsRequest } from "../schemas/query"

export async function listAppointments(input: ListAppointmentsRequest) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const { appUrl } = await resolveTenantSettings({
    workspaceId: input.workspaceId,
  })

  return await appointmentService.list({
    workspaceId: input.workspaceId,
    calendarId: input.calendarId,
    tab: input.tab,
    search: input.name,
    page: input.page,
    perPage: input.perPage,
    appUrl,
  })
}
