import {
  type BroadcastCalendarRow,
  broadcastService,
} from "@chatbotx.io/business"
import type { BroadcastStatus } from "@chatbotx.io/database/partials"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  type CalendarRange,
  getCalendarQueryRange,
  parseDateParam,
} from "../lib/calendar-grid"

export async function listBroadcastsForCalendar(input: {
  workspaceId: string
  range: CalendarRange
  date: string
  status: BroadcastStatus | null
  name: string | null
}): Promise<BroadcastCalendarRow[]> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const { from, to } = getCalendarQueryRange(
    input.range,
    parseDateParam(input.date),
  )
  return broadcastService.listForCalendar({
    workspaceId: input.workspaceId,
    from,
    to,
    status: input.status ?? undefined,
    name: input.name ?? undefined,
  })
}
