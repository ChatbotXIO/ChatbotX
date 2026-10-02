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
import {
  checkGuestRateLimit,
  getGuestClientIp,
} from "@/lib/rate-limit/guest-rate-limit"

const workspaceGuestConversationPrefix = (workspaceId: string): string =>
  `${workspaceId}:`

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
