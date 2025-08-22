import { Button } from "@aha.chat/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
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
  const t = await getTranslations()

  const promises = Promise.all([
    listBroadcasts({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <div>
      <div className="mb-4 flex w-full justify-end">
        <div className="mb-4 flex w-full justify-end">
          <Button asChild size="sm">
            <Link href={`/chatbots/${chatbotId}/broadcasts/create`}>
              <PlusIcon />
              {t("actions.add")}
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
