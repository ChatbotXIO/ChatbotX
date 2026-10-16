import "server-only"
import {
  getLeaderboardPublicBoard,
  getLeaderboardViewer,
  leaderboardService,
} from "@chatbotx.io/business/leaderboard"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"
import { buildLeaderboardShareUrl } from "./leaderboard-share"

export type PublicLeaderboardBoard = NonNullable<
  Awaited<ReturnType<typeof getLeaderboardPublicBoard>>
>

export type PublicLeaderboardViewer = {
  rank: number | null
  score: number
  name: string | null
  avatar: string | null
  shareUrl: string | null
}

/** Shared board for the public page, or null when it must not be shown. */
export async function loadPublicLeaderboardBoard(
  leaderboardId: string,
): Promise<PublicLeaderboardBoard | null> {
  // Gate on the workspace first so a blocked/deleted workspace never builds
  // (or warms Redis for) its board.
  if (!(await isLeaderboardServable(leaderboardId))) {
    return null
  }
  return await getLeaderboardPublicBoard(leaderboardId)
}

async function isLeaderboardServable(leaderboardId: string): Promise<boolean> {
  const leaderboard = await leaderboardService.findUnscoped(leaderboardId)
  if (!leaderboard) {
    return false
  }
  const { servable } = await loadServableWorkspace(leaderboard.workspaceId)
  return servable
}

/** The viewer's personal bar, or null for an anonymous/invalid token. */
export async function loadPublicLeaderboardViewer(input: {
  leaderboardId: string
  token: string | undefined
}): Promise<PublicLeaderboardViewer | null> {
  if (!(input.token && (await isLeaderboardServable(input.leaderboardId)))) {
    return null
  }
  const viewer = await getLeaderboardViewer({
    leaderboardId: input.leaderboardId,
    token: input.token,
  })
  if (!viewer) {
    return null
  }
  const leaderboard = await leaderboardService.findUnscoped(input.leaderboardId)
  const shareUrl = leaderboard
    ? await buildLeaderboardShareUrl({
        leaderboard,
        contactId: viewer.contactId,
        contactInboxId: viewer.contactInboxId,
      })
    : null
  return {
    rank: viewer.rank,
    score: viewer.score,
    name: viewer.name,
    avatar: viewer.avatar,
    shareUrl,
  }
}
