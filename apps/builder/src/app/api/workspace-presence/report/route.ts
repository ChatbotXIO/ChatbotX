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
 * No `.max()` bound here — LOW-7: this route must stay tolerant of an
 * over-cap batch (truncating it below, via
 * `truncatePresenceUserIds`/`MAX_PRESENCE_USER_IDS_PER_REPORT`) rather than
 * 400ing the whole report and turning an oversized workspace's presence
 * dark. The realtime party already truncates before ever sending, so this
 * is defense in depth, not the primary enforcement point.
 */
const presenceReportBodySchema = z.object({
  userIds: z.array(zodBigintAsString()),
})

/**
 * Server-to-server target for the realtime server's presence report: each
 * `workspaces` room POSTs its distinct connected user ids every
 * `PRESENCE_REPORT_INTERVAL_MS`, and this writes them into Redis in one
 * batch. See `docs/realtime.md`.
 *
 * No session, cookie or CSRF surface — it reuses the bearer secret and JWT
 * scheme the party already uses for inbound broadcasts, in the opposite
 * direction, under its own `purpose` claim so neither can be replayed as
 * the other. The audience binds the `workspaceId`, which travels as a QUERY
 * param so it is known before the body is read.
 *
 * Order matters:
 *   1. Read the bearer token and `workspaceId` — no body needed.
 *   2. Verify signature/expiry/audience/purpose. Only then is the body
 *      parsed, so a forged header never reaches `req.json()`.
 *   3. Parse and truncate `userIds`.
 *   4. Recompute `hashPresenceUserIds` over that exact set and compare with
 *      the token's `bodyHash` claim, so a captured token cannot be replayed
 *      with a different member list.
 * Any failure in 2-4 answers 401 before any Redis or database work.
 *
 * A `heartbeatMany` failure still answers 200: the service never throws
 * (it degrades internally), the caller has no retries, and the next report
 * supersedes a lost one — a 5xx would only invite a pointless retry storm.
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
