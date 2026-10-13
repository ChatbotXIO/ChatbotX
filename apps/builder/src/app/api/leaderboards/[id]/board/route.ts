import { createHash } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { loadPublicLeaderboardBoard } from "@/features/leaderboards/lib/public-board"

export const dynamic = "force-dynamic"

const LEADERBOARD_ID_PATTERN = /^\d{1,19}$/

/**
 * Shared part of the public leaderboard page (banner, countdown, Top 50) —
 * identical for every viewer, so it is CDN-cacheable for a few seconds and
 * answers a matching `If-None-Match` with 304. The Top 50 itself is a 3-second
 * Redis cache, so a viral page costs at most one small query per window.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!LEADERBOARD_ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "notFound" }, { status: 404 })
  }
  const board = await loadPublicLeaderboardBoard(id)
  if (!board) {
    return NextResponse.json({ error: "notFound" }, { status: 404 })
  }
  const body = JSON.stringify(board)
  const etag = `"${createHash("sha1").update(body).digest("base64url")}"`
  const headers = {
    "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10",
    ETag: etag,
  }
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers })
  }
  return new NextResponse(body, {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}
