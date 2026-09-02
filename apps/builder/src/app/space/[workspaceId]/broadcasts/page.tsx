import { getIdFromParams } from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { BroadcastsTable } from "@/features/broadcasts/broadcasts-table"
import { BroadcastsCalendar } from "@/features/broadcasts/components/broadcasts-calendar"
import { BroadcastsListShell } from "@/features/broadcasts/components/broadcasts-list-shell"
import { BROADCASTS_PANEL_COOKIE } from "@/features/broadcasts/lib/broadcast-status"
import {
  resolveDateParam,
  resolveEndDateParam,
} from "@/features/broadcasts/lib/calendar-grid"
import { listBroadcasts } from "@/features/broadcasts/queries"
import { listBroadcastsForCalendar } from "@/features/broadcasts/queries/list-broadcasts-for-calendar"
import { getBroadcastsSearchParamsCache } from "@/features/broadcasts/schema/query"
import { getUserTimezone } from "@/lib/timezone"

export default async function BroadcastsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const search = getBroadcastsSearchParamsCache.parse(await props.searchParams)
  const panelOpen =
    (await cookies()).get(BROADCASTS_PANEL_COOKIE)?.value !== "false"
  const filtered = Boolean(search.name || search.status)

  if (search.view === "calendar") {
    const timezone = await getUserTimezone()
    const calendarDate = resolveDateParam(search.date, timezone)
    const calendarEndDate = resolveEndDateParam(search.endDate, calendarDate)
    const broadcasts = await listBroadcastsForCalendar({
      workspaceId,
      range: search.range,
      date: calendarDate,
      endDate: calendarEndDate,
      status: search.status,
      name: search.name,
      timezone,
    })
    return (
      <BroadcastsListShell defaultPanelOpen={panelOpen}>
        <BroadcastsCalendar
          broadcasts={broadcasts}
          date={calendarDate}
          endDate={calendarEndDate}
          range={search.range}
        />
      </BroadcastsListShell>
    )
  }

  const promises = Promise.all([listBroadcasts({ ...search, workspaceId })])
  return (
    <BroadcastsListShell defaultPanelOpen={panelOpen}>
      <Suspense>
        <BroadcastsTable filtered={filtered} promises={promises} />
      </Suspense>
    </BroadcastsListShell>
  )
}
