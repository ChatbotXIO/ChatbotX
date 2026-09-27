import {
  integrationWebchatService,
  resolveBroadcastSecret,
} from "@chatbotx.io/business"
import { signGuestConnectToken } from "@chatbotx.io/partysocket-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isOriginAuthorized } from "@/features/integration-webchat/lib/authorized-domain"
import { zodGuestConversationId } from "@/features/integration-webchat/lib/guest-conversation-id"
import { verifyWebchatAccessToken } from "@/features/integration-webchat/lib/webchat-access-token"

const bearerTokenSeparator = /\s+/

const requestSchema = z.object({
  guestConversationId: zodGuestConversationId(),
  parentOrigin: z.string().optional(),
  workspaceId: zodBigintAsString(),
  webchatId: zodBigintAsString(),
})

const getBearerToken = (request: NextRequest): string | null => {
  const authorization = request.headers.get("authorization")
  if (!authorization) {
    return null
  }
  const [scheme, token] = authorization.split(bearerTokenSeparator)
  return scheme === "Bearer" && token ? token : null
}

export const POST = async (request: NextRequest) => {
  const input = requestSchema.safeParse(await request.json())
  if (!input.success) {
    return new NextResponse(null, { status: 400 })
  }

  const { guestConversationId, parentOrigin, webchatId, workspaceId } =
    input.data
  const webchat = await integrationWebchatService.findByIdForWorkspaceOrNull({
    id: webchatId,
    workspaceId,
  })
  if (!webchat) {
    return new NextResponse(null, { status: 404 })
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
    { guestConversationId },
    await resolveBroadcastSecret(),
  )
  return NextResponse.json({ token })
}
