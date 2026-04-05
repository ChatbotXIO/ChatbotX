import { rootFolderId } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { listTags } from "@/features/tags/queries"
import { listTagsSearchParamsCache } from "@/features/tags/schema/query"
import { TagsTable } from "@/features/tags/tags-table"

export default async function TagsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listTagsSearchParamsCache.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listTags({
      ...search,
      folderId,
      workspaceId,
    }),
  ])

  return (
    <Suspense>
      <TagsTable
        folderId={folderId}
        promises={promises}
        workspaceId={workspaceId}
      />
    </Suspense>
  )
}
