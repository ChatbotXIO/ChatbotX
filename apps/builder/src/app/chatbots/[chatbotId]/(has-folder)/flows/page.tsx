import { rootFolderId } from "@chatbotx.io/database/enums"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { FlowsTable } from "@/features/flows/flows-table"
import { listFlowsRSC } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/query"

export default async function FlowsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }
  const searchParams = await props.searchParams

  const search = await listFlowsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listFlowsRSC({
      ...search,
      folderId,
      chatbotId,
    }),
  ])

  return (
    <Suspense>
      <FlowsTable
        chatbotId={chatbotId}
        folderId={folderId}
        promises={promises}
      />
    </Suspense>
  )
}
