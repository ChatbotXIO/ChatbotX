import {
  integrationWebchatService,
  resolveBroadcastSecret,
} from "@chatbotx.io/business"
import {
  extractBearerToken,
  signGuestConnectToken,
} from "@chatbotx.io/realtime-protocol"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isOriginAuthorized } from "@/features/integration-webchat/lib/authorized-domain"
import { zodGuestConversationId } from "@/features/integration-webchat/lib/guest-conversation-id"
import { verifyWebchatAccessToken } from "@/features/integration-webchat/lib/webchat-access-token"
import { checkApiRateLimit } from "@/lib/rate-limit/api-rate-limit"
import {
  checkGuestRateLimit,
  getGuestClientIp,
} from "@/lib/rate-limit/guest-rate-limit"

const workspaceGuestConversationPrefix = (workspaceId: string): string =>
  `${workspaceId}:`

// A single workspace's guest-token minting, independent of caller IP: the
// per-IP/per-session check above is spoofable by rotating `X-Forwarded-For`,
// but every mint still has to name the target workspace, so this bucket is
// the only place that can see "how many distinct new conversations is THIS
// WORKSPACE minting tokens for" regardless of who's asking. Filling the
// gateway's `REALTIME_MAX_GUEST_CONNECTIONS_PER_WORKSPACE` cap (1,000, at 5
// sockets per `REALTIME_MAX_CONNECTIONS_PER_GUEST`) needs ~200 distinct new
// guestConversationIds; capping this bucket well under a tenth of that per
// 10s window (WINDOW_SECONDS in api-rate-limit.ts) makes a single-window
// exhaustion attempt impossible while still allowing a couple of brand-new
// guest visitors per second for one workspace — far above realistic organic
// webchat traffic for a single site.
const GUEST_REALTIME_MINT_WORKSPACE_LIMIT = 20

const requestSchema = z.object({
  guestConversationId: zodGuestConversationId(),
  parentOrigin: z.string().optional(),
  workspaceId: zodBigintAsString(),
  webchatId: zodBigintAsString(),
})

const getBearerToken = (request: NextRequest): string | null =>
  extractBearerToken(request.headers.get("authorization"))

export const POST = async (request: NextRequest) => {
  const input = requestSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return new NextResponse(null, { status: 400 })
  }

  const { guestConversationId, parentOrigin, webchatId, workspaceId } =
    input.data

  const rateLimit = await checkGuestRateLimit({
    clientIp: getGuestClientIp(request.headers),
    guestConversationId,
    webchatId,
  })
  if (rateLimit.limited) {
    return new NextResponse(null, {
      headers: { "Retry-After": String(rateLimit.retryAfter) },
      status: 429,
    })
  }

  const workspaceRateLimit = await checkApiRateLimit({
    scope: "guest-realtime-mint-workspace-rate-limit",
    key: workspaceId,
    limit: GUEST_REALTIME_MINT_WORKSPACE_LIMIT,
  })
  if (workspaceRateLimit.limited) {
    return new NextResponse(null, {
      headers: { "Retry-After": String(workspaceRateLimit.retryAfter) },
      status: 429,
    })
  }

  const webchat = await integrationWebchatService.findByIdForWorkspaceOrNull({
    id: webchatId,
    workspaceId,
  })
  if (!webchat) {
    return new NextResponse(null, { status: 404 })
  }

  // Legacy digits-only ids predate the workspace-prefixed scheme and carry
  // no proof on their face of which workspace — or which caller — they
  // belong to. A workspace-scoped existence check only proves the
  // conversation exists somewhere in this workspace, not that the caller
  // owns it: an enumerable Snowflake id lets anyone guess a neighbor's
  // conversation and mint a token for it. Refuse outright; the client
  // re-keys to a `<workspaceId>:<uuid>` id via `readLegacyGuestId` on the
  // next load instead of continuing to send this id.
  if (!guestConversationId.includes(":")) {
    return new NextResponse(null, { status: 400 })
  }

  if (
    !guestConversationId.startsWith(
      workspaceGuestConversationPrefix(workspaceId),
    )
  ) {
    return new NextResponse(null, { status: 400 })
  }

  const { authorized: tokenAuthorized } = await verifyWebchatAccessToken({
    token: getBearerToken(request),
    origin: parentOrigin,
    webchatId,
    workspaceId,
  })
  const originAuthorized =
    webchat.authorizedDomains.length === 0 ||
    isOriginAuthorized(parentOrigin, webchat.authorizedDomains)
  if (!(tokenAuthorized && originAuthorized)) {
    return new NextResponse(null, { status: 403 })
  }

  const token = await signGuestConnectToken(
    { guestConversationId, workspaceId },
    await resolveBroadcastSecret(),
  )
  return NextResponse.json({ token })
}
