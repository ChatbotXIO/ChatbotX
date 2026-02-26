import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AuditLogsTable } from "@/enterprise/features/audit-logs/audit-logs-table"
import { listAuditLogs } from "@/enterprise/features/audit-logs/queries"
import { listAuditLogsSearchParamsCache } from "@/enterprise/features/audit-logs/schemas/query"

export default async function AuditLogsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listAuditLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listAuditLogs({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <Suspense>
      <AuditLogsTable chatbotId={params.chatbotId} promises={promises} />
    </Suspense>
  )
}
