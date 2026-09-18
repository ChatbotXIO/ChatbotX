import { workspacePresenceService } from "@chatbotx.io/business"
import {
  extractBearerToken,
  REALTIME_TOKEN_PURPOSE,
  verifyRealtimeToken,
} from "@chatbotx.io/partysocket-config/auth"
import {
  hashPresenceUserIds,
  truncatePresenceUserIds,
} from "@chatbotx.io/partysocket-config/presence"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { env } from "@/env"
import { logger } from "@/lib/log"

const WORKSPACE_ID_QUERY_PARAM = "workspaceId"

/**
 * No .max() — an over-cap batch is truncated below rather than rejected with
 * 400, so an oversized workspace's presence doesn't go dark.
 */
const presenceReportBodySchema = z.object({
  userIds: z.array(zodBigintAsString()),
})

/**
 * Server-to-server target for the realtime server's presence report. See
 * docs/realtime.md.
 *
 * Uses its own token purpose claim so this direction can't replay a token
 * from the inbound-broadcast direction. Token is verified before the body is
 * parsed, so a forged header never reaches req.json(); the parsed/truncated
 * userIds are then hashed and matched against the token's bodyHash claim so
 * a captured token can't be replayed with a different member list.
 *
 * Always answers 200 even if heartbeatMany fails — the caller has no
 * retries, and the next report supersedes a lost one.
 */
export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("Authorization"))
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const workspaceIdParam = new URL(req.url).searchParams.get(
    WORKSPACE_ID_QUERY_PARAM,
  )
  const workspaceIdResult = zodBigintAsString().safeParse(workspaceIdParam)
  if (!workspaceIdResult.success) {
    return NextResponse.json(
      { error: "Missing or invalid workspaceId" },
      { status: 400 },
    )
  }
  const workspaceId = workspaceIdResult.data

  let payload: Awaited<ReturnType<typeof verifyRealtimeToken>>
  try {
    payload = await verifyRealtimeToken(
      token,
      { kind: "workspace", id: workspaceId },
      REALTIME_TOKEN_PURPOSE.presenceReport,
      env.REALTIME_BROADCAST_SECRET,
    )
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = presenceReportBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const userIds = truncatePresenceUserIds(parsed.data.userIds)
  const expectedBodyHash = await hashPresenceUserIds(userIds)
  const claimedBodyHash = payload.bodyHash
  if (
    typeof claimedBodyHash !== "string" ||
    claimedBodyHash !== expectedBodyHash
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await workspacePresenceService.heartbeatMany({ workspaceId, userIds })
  } catch (err) {
    logger.error(
      { err, workspaceId },
      "Workspace presence report failed unexpectedly",
    )
  }

  return NextResponse.json({ ok: true })
}
