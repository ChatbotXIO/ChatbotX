import { CreateTagDialog } from "@/features/tags/create-tag-dialog"
import { getTags } from "@/features/tags/queries"
import { getTagsSearchParamsCache } from "@/features/tags/schemas/get-tags-schema"
import { TagsTable } from "@/features/tags/tags-table"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function TagsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getTagsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getTags({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <div>
      <div className="flex w-full justify-end mb-4">
        <CreateTagDialog
          chatbotId={params.chatbotId}
          folderId={search.folderId}
        />
      </div>
      <Suspense>
        <TagsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </div>
  )
}
