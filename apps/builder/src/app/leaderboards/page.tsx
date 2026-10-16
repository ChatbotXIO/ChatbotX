import type { Metadata } from "next"
import type { SearchParams } from "next/dist/server/request/search-params"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { LeaderboardPublicView } from "@/features/leaderboards/components/public/leaderboard-public-view"
import {
  loadPublicLeaderboardBoard,
  loadPublicLeaderboardViewer,
} from "@/features/leaderboards/lib/public-board"

export const dynamic = "force-dynamic"

const LEADERBOARD_ID_PATTERN = /^\d{1,19}$/

type LeaderboardPageProps = {
  searchParams: Promise<SearchParams>
}

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leaderboards")
  return { title: t("title") }
}

/**
 * Public leaderboard page. Anyone with the link sees the board; a signed
 * `token` (`{{leaderboard_view_token}}`, filled when a flow sends the link)
 * adds the viewer's rank and referral button. An unresolved
 * `{{leaderboard_view_token}}` (link opened outside a flow) is ignored.
 */
export default async function LeaderboardPage(props: LeaderboardPageProps) {
  const searchParams = await props.searchParams
  const leaderboardId = getParam(searchParams.leaderboardId)
  const rawToken = getParam(searchParams.token)
  const token = rawToken && !rawToken.startsWith("{{") ? rawToken : undefined

  if (!(leaderboardId && LEADERBOARD_ID_PATTERN.test(leaderboardId))) {
    notFound()
  }
  const board = await loadPublicLeaderboardBoard(leaderboardId)
  if (!board) {
    notFound()
  }
  const viewer = await loadPublicLeaderboardViewer({ leaderboardId, token })

  return (
    <LeaderboardPublicView
      initialBoard={board}
      initialViewer={viewer}
      token={viewer ? (token ?? null) : null}
    />
  )
}
