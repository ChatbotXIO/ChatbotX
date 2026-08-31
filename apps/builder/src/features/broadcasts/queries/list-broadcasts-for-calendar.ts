import {
  type BroadcastCalendarRow,
  broadcastService,
} from "@chatbotx.io/business"
import type { BroadcastStatus } from "@chatbotx.io/database/partials"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { getCalendarQueryRange, parseMonthParam } from "../lib/calendar-grid"

export async function listBroadcastsForCalendar(input: {
  workspaceId: string
  month: string
  status: BroadcastStatus | null
  name: string | null
}): Promise<BroadcastCalendarRow[]> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const { from, to } = getCalendarQueryRange(parseMonthParam(input.month))
  return broadcastService.listForCalendar({
    workspaceId: input.workspaceId,
    from,
    to,
    status: input.status ?? undefined,
    name: input.name ?? undefined,
  })
}
