import { ErrorLogsTable } from "@/features/logs/error-logs-table"
import { getLogs } from "@/features/logs/queries"
import { getLogsSearchParamsCache } from "@/features/logs/schemas/get-logs-schema"
import { LogType } from "@ahachat.ai/database"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function ErrorLogsPage(props: {
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
      logType: LogType.Error,
    }),
  ])

  return (
    <div>
      <Suspense>
        <ErrorLogsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </div>
  )
}
