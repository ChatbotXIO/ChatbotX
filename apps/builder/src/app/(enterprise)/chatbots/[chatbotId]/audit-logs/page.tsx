import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AuditLogsTable } from "@/enterprise/features/audit-logs/audit-logs-table"
import { listAuditLogs } from "@/enterprise/features/audit-logs/queries"
import { listAuditLogsSearchParamsCache } from "@/enterprise/features/audit-logs/schemas/query"

export default async function AuditLogsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listAuditLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listAuditLogs({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <Suspense>
      <AuditLogsTable chatbotId={chatbotId} promises={promises} />
    </Suspense>
  )
}
