import { rootFolderId } from "@aha.chat/database/enums"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateTagDialog } from "@/features/tags/create-tag-dialog"
import { getTags } from "@/features/tags/queries"
import { getTagsSearchParamsCache } from "@/features/tags/schemas/get-tags-schema"
import { TagsTable } from "@/features/tags/tags-table"

export default async function TagsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getTagsSearchParamsCache.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    getTags({
      ...search,
      folderId,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <>
      <div className="mb-4 flex w-full justify-end">
        <CreateTagDialog
          chatbotId={params.chatbotId}
          folderId={search.folderId}
        />
      </div>

      <Suspense>
        <TagsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </>
  )
}
