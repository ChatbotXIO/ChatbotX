import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { BroadcastsTable } from "@/features/broadcasts/broadcasts-table"
import { listBroadcasts } from "@/features/broadcasts/queries"
import { getBroadcastsSearchParamsCache } from "@/features/broadcasts/schemas/query"

export default async function BroadcastsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = getBroadcastsSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    listBroadcasts({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">{t("broadcasts.title")}</h3>
      <Suspense>
        <BroadcastsTable promises={promises} />
      </Suspense>
    </div>
  )
}
