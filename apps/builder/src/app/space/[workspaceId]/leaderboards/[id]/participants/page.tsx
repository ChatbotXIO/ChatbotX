import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { ParticipantsView } from "@/features/leaderboards/components/participants/participants-view"
import { listParticipantsSearchParamsCache } from "@/features/leaderboards/lib/search-params"
import {
  findLeaderboard,
  listLeaderboardParticipants,
} from "@/features/leaderboards/queries"

export default async function LeaderboardParticipantsPage({
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
  const [t, leaderboard] = await Promise.all([
    getTranslations(),
    findLeaderboard({ workspaceId, id }),
  ])
  if (!leaderboard) {
    return notFound()
  }
  const search = listParticipantsSearchParamsCache.parse(await searchParams)
  const promises = Promise.all([
    listLeaderboardParticipants({
      workspaceId,
      leaderboardId: id,
      keyword: search.participant?.trim() || null,
      filter: search.filter,
      page: search.page,
      perPage: search.perPage,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("leaderboards.title"),
            href: `/space/${workspaceId}/leaderboards`,
          },
          { label: leaderboard.name, href: "" },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <ParticipantsView
          leaderboard={leaderboard}
          promises={promises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
