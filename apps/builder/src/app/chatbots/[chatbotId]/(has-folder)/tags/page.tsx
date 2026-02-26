import { rootFolderId } from "@aha.chat/database/enums"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { listTags } from "@/features/tags/queries"
import { listTagsSearchParamsCache } from "@/features/tags/schemas/query"
import { TagsTable } from "@/features/tags/tags-table"

export default async function TagsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = await listTagsSearchParamsCache.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listTags({
      ...search,
      folderId,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <Suspense>
      <TagsTable
        chatbotId={params.chatbotId}
        folderId={folderId}
        promises={promises}
      />
    </Suspense>
  )
}
