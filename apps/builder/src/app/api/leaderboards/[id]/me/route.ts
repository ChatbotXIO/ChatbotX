import { type NextRequest, NextResponse } from "next/server"
import { loadPublicLeaderboardViewer } from "@/features/leaderboards/lib/public-board"

export const dynamic = "force-dynamic"

const LEADERBOARD_ID_PATTERN = /^\d{1,19}$/

/**
 * Per-viewer part of the public page ("my rank"). Identity comes only from
 * the signed `token`, verified against the leaderboard's workspace. Never
 * cached — it differs per viewer.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const token = request.nextUrl.searchParams.get("token") ?? undefined
  if (!LEADERBOARD_ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "notFound" }, { status: 404 })
  }
  const viewer = await loadPublicLeaderboardViewer({ leaderboardId: id, token })
  return NextResponse.json(
    { viewer },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
