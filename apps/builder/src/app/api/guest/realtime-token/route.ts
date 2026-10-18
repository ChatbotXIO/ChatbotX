import {
  integrationWebchatService,
  isWorkspaceScheduledForDeletion,
  resolveBroadcastSecret,
  workspaceService,
} from "@chatbotx.io/business"
import {
  extractBearerToken,
  signGuestConnectToken,
} from "@chatbotx.io/realtime-protocol"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isAllowedGuestOrigin } from "@/features/integration-webchat/lib/authorized-domain"
import { zodGuestConversationId } from "@/features/integration-webchat/lib/guest-conversation-id"
import { verifyWebchatAccessToken } from "@/features/integration-webchat/lib/webchat-access-token"
import { getDomainFromHeader } from "@/lib/domain"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { checkApiRateLimit } from "@/lib/rate-limit/api-rate-limit"
import {
  checkGuestRateLimit,
  getGuestClientIp,
} from "@/lib/rate-limit/guest-rate-limit"

const workspaceGuestConversationPrefix = (workspaceId: string): string =>
  `${workspaceId}:`

// A workspace-level bucket limits every token mint, regardless of client IP
// or guest id. Gateway restarts reconnect every open browser tab at once, so
// retain enough burst capacity for a busy workspace while still staying far
// below its 1,000-connection guest cap.
const GUEST_REALTIME_MINT_WORKSPACE_LIMIT = 100

const requestSchema = z.object({
  guestConversationId: zodGuestConversationId(),
  parentOrigin: z.string().optional(),
  workspaceId: zodBigintAsString(),
  webchatId: zodBigintAsString(),
})

const getBearerToken = (request: NextRequest): string | null =>
  extractBearerToken(request.headers.get("authorization"))

export const POST = async (request: NextRequest) => {
  try {
    const input = requestSchema.safeParse(
      await request.json().catch(() => null),
    )
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

    if (
      !(
        guestConversationId.includes(":") &&
        guestConversationId.startsWith(
          workspaceGuestConversationPrefix(workspaceId),
        )
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
    if (!tokenAuthorized) {
      return new NextResponse(null, { status: 403 })
    }

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (workspace && isWorkspaceScheduledForDeletion(workspace)) {
      return new NextResponse(null, { status: 403 })
    }

    const webchat = await integrationWebchatService.findByIdForWorkspaceOrNull({
      id: webchatId,
      workspaceId,
    })
    if (!webchat) {
      return new NextResponse(null, { status: 404 })
    }

    if (
      !isAllowedGuestOrigin(
        parentOrigin,
        webchat.authorizedDomains,
        await getDomainFromHeader(),
      )
    ) {
      return new NextResponse(null, { status: 403 })
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

    const token = await signGuestConnectToken(
      { guestConversationId, workspaceId },
      resolveBroadcastSecret(),
    )
    return NextResponse.json({ token })
  } catch (error) {
    return serverErrorHandler(error)
  }
}
