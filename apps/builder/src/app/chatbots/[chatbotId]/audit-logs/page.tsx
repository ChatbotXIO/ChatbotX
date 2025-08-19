import { LogType } from "@aha.chat/database"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AuditLogsTable } from "@/features/logs/audit-logs-table"
import { getLogs } from "@/features/logs/queries"
import { getLogsSearchParamsCache } from "@/features/logs/schemas/get-logs-schema"

export default async function AuditLogsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getLogs({
      ...search,
      chatbotId: params.chatbotId,
      logType: LogType.Audit,
    }),
  ])

  return (
    <div>
      <Suspense>
        <AuditLogsTable promises={promises} />
      </Suspense>
    </div>
  )
}
