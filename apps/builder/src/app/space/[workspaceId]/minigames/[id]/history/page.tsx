import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { MinigameHistoryTable } from "@/features/minigames/components/minigame-history-table"
import { findMinigame, listMinigameHistory } from "@/features/minigames/queries"
import { listMinigameHistorySearchParamsCache } from "@/features/minigames/schemas/query"

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
  const [t, minigame, search] = await Promise.all([
    getTranslations(),
    findMinigame({ workspaceId, id }),
    listMinigameHistorySearchParamsCache.parse(await searchParams),
  ])
  if (!minigame) {
    return notFound()
  }
  const tablePromises = Promise.all([
    listMinigameHistory({
      ...search,
      workspaceId,
      minigameId: id,
    }),
  ])
  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("minigames.title"),
            href: `/space/${workspaceId}/minigames`,
          },
          {
            label: minigame.name,
            href: `/space/${workspaceId}/minigames/${id}/edit`,
          },
          { label: t("minigames.history.title"), href: "" },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <MinigameHistoryTable
          minigameId={id}
          promises={tablePromises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
