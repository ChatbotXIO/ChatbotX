import { rootFolderId } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { FlowsTable } from "@/features/flows/flows-table"
import { listFlowsRSC } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/query"

export default async function FlowsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const searchParams = await props.searchParams

  const search = await listFlowsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listFlowsRSC({
      ...search,
      folderId,
      workspaceId,
    }),
  ])

  return (
    <Suspense>
      <FlowsTable
        folderId={folderId}
        promises={promises}
        workspaceId={workspaceId}
      />
    </Suspense>
  )
}
