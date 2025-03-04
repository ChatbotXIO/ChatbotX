import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { AuditLogsTable } from "@/features/logs/audit-logs-table"
import { getLogs } from "@/features/logs/queries"
import { getLogsSearchParamsCache } from "@/features/logs/schemas/get-logs-schema"
import { LogType } from "@ahachat.ai/database"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

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
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={5}
            searchableColumnCount={1}
            filterableColumnCount={2}
            cellWidths={["10rem", "20rem", "40rem", "12rem", "10rem"]}
            shrinkZero
          />
        }
      >
        <AuditLogsTable promises={promises} />
      </Suspense>
    </div>
  )
}
