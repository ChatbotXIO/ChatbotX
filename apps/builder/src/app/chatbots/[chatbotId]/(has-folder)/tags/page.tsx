import { rootFolderId } from "@chatbotx.io/database/enums"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { listTags } from "@/features/tags/queries"
import { listTagsSearchParamsCache } from "@/features/tags/schemas/query"
import { TagsTable } from "@/features/tags/tags-table"

export default async function TagsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listTagsSearchParamsCache.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listTags({
      ...search,
      folderId,
      chatbotId,
    }),
  ])

  return (
    <Suspense>
      <TagsTable
        chatbotId={chatbotId}
        folderId={folderId}
        promises={promises}
      />
    </Suspense>
  )
}
