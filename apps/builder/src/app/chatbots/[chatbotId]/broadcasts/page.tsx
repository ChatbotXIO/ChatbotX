import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { BroadcastsTable } from "@/features/broadcasts/broadcasts-table"
import { CreateBroadcastDialog } from "@/features/broadcasts/create-broadcast-dialog"
import { listBroadcasts } from "@/features/broadcasts/queries"
import { getBroadcastsSearchParamsCache } from "@/features/broadcasts/schemas/get-broadcasts-schema"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function BroadcastsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getBroadcastsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listBroadcasts({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <div>
      <div className="flex w-full justify-end mb-4">
        <div className="flex w-full justify-end mb-4">
          <CreateBroadcastDialog chatbotId={params.chatbotId} />
        </div>
      </div>
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={6}
            searchableColumnCount={1}
            filterableColumnCount={2}
            cellWidths={["10rem", "40rem", "12rem", "12rem", "8rem", "8rem"]}
            shrinkZero
          />
        }
      >
        <BroadcastsTable promises={promises} />
      </Suspense>
    </div>
  )
}
