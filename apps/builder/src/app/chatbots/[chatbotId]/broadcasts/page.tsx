import { Button } from "@/components/ui/button"
import { BroadcastsTable } from "@/features/broadcasts/broadcasts-table"
import { listBroadcasts } from "@/features/broadcasts/queries"
import { getBroadcastsSearchParamsCache } from "@/features/broadcasts/schemas/get-broadcasts-schema"
import { T } from "@/tolgee/server"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

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
    <div>
      <div className="flex w-full justify-end mb-4">
        <div className="flex w-full justify-end mb-4">
          <Button size="sm" asChild>
            <Link href={`/chatbots/${chatbotId}/broadcasts/create`}>
              <PlusIcon />
              <T keyName="broadcasts.addBtn" />
            </Link>
          </Button>
        </div>
      </div>

      <Suspense>
        <BroadcastsTable promises={promises} />
      </Suspense>
    </div>
  )
}
