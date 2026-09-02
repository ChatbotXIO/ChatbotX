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
  parseEndDateParam,
} from "../lib/calendar-grid"

export async function listBroadcastsForCalendar(input: {
  workspaceId: string
  range: CalendarRange
  date: string
  endDate: string
  status: BroadcastStatus | null
  name: string | null
  /** The user's IANA zone — day boundaries are computed in it, not the server zone. */
  timezone: string
}): Promise<BroadcastCalendarRow[]> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  const anchor = parseDateParam(input.date)
  const endAnchor = parseEndDateParam(input.endDate, anchor)
  const { from, to } = getCalendarQueryRange(
    input.range,
    anchor,
    endAnchor,
    input.timezone,
  )
  return broadcastService.listForCalendar({
    workspaceId: input.workspaceId,
    from,
    to,
    status: input.status ?? undefined,
    name: input.name ?? undefined,
  })
}
