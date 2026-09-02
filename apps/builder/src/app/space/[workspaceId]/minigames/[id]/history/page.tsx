import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { MinigameHistoryTable } from "@/features/minigames/components/minigame-history-table"
import { listMinigameHistory } from "@/features/minigames/queries"
import { listMinigameHistorySearchParamsCache } from "@/features/minigames/schema/query"

export default async function MinigameHistoryPage({
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
  const [t, search] = await Promise.all([
    getTranslations(),
    listMinigameHistorySearchParamsCache.parse(await searchParams),
  ])
  const tablePromises = Promise.all([
    listMinigameHistory({
      ...search,
      workspaceId,
      minigameId: id,
    }),
  ])
  return (
    <Suspense fallback={<div>{t("actions.loading")}</div>}>
      <MinigameHistoryTable
        minigameId={id}
        promises={tablePromises}
        workspaceId={workspaceId}
      />
    </Suspense>
  )
}
