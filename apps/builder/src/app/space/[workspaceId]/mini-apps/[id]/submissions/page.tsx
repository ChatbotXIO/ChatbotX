import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import {
  findMiniApp,
  listMiniAppSubmissions,
} from "@/features/mini-apps/queries"
import { listMiniAppSubmissionsSearchParamsCache } from "@/features/mini-apps/schema/query"
import { SubmissionsTable } from "@/features/mini-apps/submissions-table"

export default async function MiniAppSubmissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; id: string }>
  searchParams: Promise<SearchParams>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }
  const miniApp = await findMiniApp({ workspaceId, id })
  if (!miniApp) {
    return notFound()
  }
  const search = listMiniAppSubmissionsSearchParamsCache.parse(
    await searchParams,
  )
  const promises = Promise.all([
    listMiniAppSubmissions({ workspaceId, miniAppId: id, ...search }),
  ])

  return (
    <Suspense>
      <SubmissionsTable
        definition={miniApp.definition}
        promises={promises}
        workspaceId={workspaceId}
      />
    </Suspense>
  )
}
