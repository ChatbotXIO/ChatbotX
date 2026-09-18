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
 * Server-to-server target for the realtime server's periodic presence
 * report — every `apps/realtime` `workspaces` room POSTs the distinct set
 * of currently-connected user ids for that workspace every
 * `PRESENCE_REPORT_INTERVAL_MS` (10s, see
 * `apps/realtime/src/parties/workspaces.ts` and `docs/realtime.md`), and
 * this route writes them ALL into Redis in one batch
 * (`workspacePresenceService.heartbeatMany`) instead of the old one
 * server-action-per-browser-tab design.
 *
 * No session, no cookie, no CSRF surface at all: authenticated purely by
 * the same internal bearer secret (`REALTIME_BROADCAST_SECRET`) and JWT
 * scheme (`signRealtimeToken`/`verifyRealtimeToken`) the party already uses
 * to authenticate INBOUND broadcast requests from the builder
 * (`verifyBroadcastRequest`) — this route is that same mechanism used in
 * the opposite direction, never a new one, but with its own `purpose`
 * claim (`REALTIME_TOKEN_PURPOSE.presenceReport`, MEDIUM-3) so a broadcast
 * token can never be replayed here and vice versa. The token's audience is
 * bound to the reported `workspaceId` (carried as a QUERY param, never in
 * the JSON body — see below), so a token minted for one workspace can
 * never report presence for another.
 *
 * MEDIUM-3 hardening, in order:
 *   1. Extract the bearer token and the `workspaceId` query param — neither
 *      requires parsing the request body.
 *   2. Verify the token's signature/expiry/audience/purpose. Only once this
 *      passes is the JSON body ever parsed — a forged or malformed
 *      Authorization header can never reach `req.json()`.
 *   3. Parse + bound the body's `userIds` (`presenceReportBodySchema`,
 *      `truncatePresenceUserIds`).
 *   4. Recompute `hashPresenceUserIds` over that exact (already-truncated)
 *      set and compare it to the verified token's `bodyHash` claim — a
 *      captured token cannot be replayed with a different member list, and
 *      a tampered body under an otherwise-valid token is rejected too.
 * Any failure at 2-4 answers 401 before any Redis or database work
 * happens.
 *
 * Deliberately swallows a `heartbeatMany` failure into a 200 rather than
 * ever letting it escalate into a 5xx "retry me" signal:
 * `workspacePresenceService.heartbeatMany` itself already never throws
 * (Redis/DB failures degrade internally — see its own doc comment), and
 * the realtime server's own caller has no retry logic either (the next
 * report supersedes a lost one anyway), so surfacing a failure here would
 * only risk a pointless retry storm against this route for zero benefit.
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
