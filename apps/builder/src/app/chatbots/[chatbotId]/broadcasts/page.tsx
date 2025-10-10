import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { BroadcastsTable } from "@/features/broadcasts/broadcasts-table"
import { listBroadcasts } from "@/features/broadcasts/queries"
import { getBroadcastsSearchParamsCache } from "@/features/broadcasts/schemas/get-broadcasts-schema"

export default async function BroadcastsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = getBroadcastsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listBroadcasts({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <Suspense>
      <BroadcastsTable promises={promises} />
    </Suspense>
  )
}
