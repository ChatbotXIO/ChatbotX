import { appointmentExternalCalendarService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export async function listExternalCalendars(input: { workspaceId: string }) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const data = await appointmentExternalCalendarService.listWithConnectedCount({
    workspaceId: input.workspaceId,
  })

  return {
    data,
    total: data.length,
    pageCount: 1,
  }
}

export async function listExternalCalendarsForSelect(input: {
  workspaceId: string
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await appointmentExternalCalendarService.listForSelect({
    workspaceId: input.workspaceId,
  })
}
