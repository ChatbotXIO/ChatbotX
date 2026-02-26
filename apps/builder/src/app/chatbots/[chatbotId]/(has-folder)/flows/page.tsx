import { rootFolderId } from "@aha.chat/database/enums"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { FlowsTable } from "@/features/flows/flows-table"
import { listFlowsRSC } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/query"

export default async function FlowsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams

  const search = await listFlowsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listFlowsRSC({
      ...search,
      folderId,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <Suspense>
      <FlowsTable
        chatbotId={params.chatbotId}
        folderId={folderId}
        promises={promises}
      />
    </Suspense>
  )
}
