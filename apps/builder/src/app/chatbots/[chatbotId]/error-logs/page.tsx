import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ErrorLogsTable } from "@/features/error-logs/error-logs-table"
import { listErrorLogs } from "@/features/error-logs/queries"
import { listErrorLogsSearchParamsCache } from "@/features/error-logs/schemas/query"

export default async function ErrorLogsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listErrorLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listErrorLogs({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <div>
      <Suspense>
        <ErrorLogsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </div>
  )
}
