import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { LeaderboardsList } from "@/features/leaderboards/components/list/leaderboards-list"
import {
  listLeaderboardsSearchParamsCache,
  parsePlatformFilter,
  parseStatusTab,
} from "@/features/leaderboards/lib/search-params"
import {
  listLeaderboards,
  listMinigameOptions,
} from "@/features/leaderboards/queries"

export default async function LeaderboardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()
  const search = listLeaderboardsSearchParamsCache.parse(await searchParams)

  const promises = Promise.all([
    listLeaderboards({
      workspaceId,
      status: parseStatusTab(search.status),
      platform: parsePlatformFilter(search.platform),
      keyword: search.name?.trim() || null,
      page: search.page,
      perPage: search.perPage,
    }),
  ])
  const minigames = await listMinigameOptions(workspaceId)
  const minigameNames = Object.fromEntries(
    minigames.map((minigame) => [minigame.value, minigame.label]),
  )

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("leaderboards.title"), href: "" },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <LeaderboardsList
          minigameNames={minigameNames}
          promises={promises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
