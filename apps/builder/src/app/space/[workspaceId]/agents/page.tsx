import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { listWorkspaceMembers } from "@/features/workspace-members/queries"
import { getWorkspaceMembersSearchParamsCache } from "@/features/workspace-members/schema/query"
import { WorkspaceMembersTable } from "@/features/workspace-members/workspace-members-table"

export default async function AgentsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = getWorkspaceMembersSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listWorkspaceMembers({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <Suspense>
      <WorkspaceMembersTable promises={promises} />
    </Suspense>
  )
}
