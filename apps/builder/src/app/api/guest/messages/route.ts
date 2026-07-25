import {
  contactInboxService,
  conversationService,
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { type NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { isOriginAuthorized } from "@/features/integration-webchat/lib/authorized-domain"
import { verifyWebchatAccessToken } from "@/features/integration-webchat/lib/webchat-access-token"
import { findIntegrationWebchat } from "@/features/integration-webchat/queries"
import { handleCreateWebchatMessage } from "@/features/messages/actions/create-webchat-message.action"
import { listMessages } from "@/features/messages/queries"
import { createWebchatMessageRequest } from "@/features/messages/schema/mutation"
import { listGuestMessagesRequest } from "@/features/messages/schema/query"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import {
  checkGuestRateLimit,
  getGuestClientIp,
} from "@/lib/rate-limit/guest-rate-limit"

const corsHeaders = (origin: string | null, authorized: boolean) => {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  })
  // Bearer-token auth (not cookie-based), so no Access-Control-Allow-Credentials.
  // Reflect the request origin only once the request is authorized.
  if (authorized && origin) {
    headers.set("Access-Control-Allow-Origin", origin)
  }
  return headers
}

const BEARER_TOKEN_SEPARATOR = /\s+/

const getBearerToken = (req: NextRequest) => {
  const authorization = req.headers.get("authorization")
  const [scheme, token] = authorization?.split(BEARER_TOKEN_SEPARATOR, 2) ?? []
  return scheme?.toLowerCase() === "bearer" ? token : null
}

const forbiddenResponse = async (headers: Headers) => {
  const t = await getTranslations("webchat.unauthorizedDomain")
  return NextResponse.json(
    {
      message: t("description"),
      errors: [],
    },
    { status: 403, headers },
  )
}

const rateLimitResponse = async (headers: Headers, retryAfter: number) => {
  const t = await getTranslations("webchat")
  headers.set("Retry-After", String(retryAfter))
  return NextResponse.json(
    { message: t("rateLimitExceeded"), errors: [] },
    { status: 429, headers },
  )
}

const emptyMessagesResponse = (headers: Headers) =>
  NextResponse.json(
    {
      data: [],
      nextCursor: null,
      prevCursor: null,
    },
    { headers },
  )

export function OPTIONS(req: NextRequest) {
  // Preflight cannot resolve the target webchat (no body/webchatId), so reflect
  // the request Origin permissively here; real enforcement happens on GET/POST.
  return new NextResponse(null, {
    headers: corsHeaders(req.headers.get("origin"), true),
    status: 204,
  })
}

export async function GET(req: NextRequest) {
  const requestOrigin = req.headers.get("origin")
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams)
    const data = listGuestMessagesRequest.parse(searchParams)

    const workspace = await workspaceService.find({
      where: { id: data.workspaceId },
    })
    if (workspace && isWorkspaceScheduledForDeletion(workspace)) {
      return await forbiddenResponse(corsHeaders(requestOrigin, false))
    }

    const rateLimit = await checkGuestRateLimit({
      clientIp: getGuestClientIp(req.headers),
      guestConversationId: data.guestConversationId,
      webchatId: data.webchatId,
    })
    if (rateLimit.limited) {
      return await rateLimitResponse(
        corsHeaders(requestOrigin, false),
        rateLimit.retryAfter,
      )
    }

    const webchat = await findIntegrationWebchat({
      id: data.webchatId,
      workspaceId: data.workspaceId,
    })

    const bearerToken = getBearerToken(req)
    // Bind-on-first-use: always require a token bound to the presented
    // origin, then layer the optional domain allowlist on top.
    const { authorized: tokenAuthorized } = await verifyWebchatAccessToken({
      token: data.accessToken ?? bearerToken,
      origin: data.parentOrigin,
      workspaceId: data.workspaceId,
      webchatId: data.webchatId,
    })
    const authorized =
      tokenAuthorized &&
      (webchat.authorizedDomains.length === 0 ||
        isOriginAuthorized(data.parentOrigin, webchat.authorizedDomains))
    const headers = corsHeaders(requestOrigin, authorized)
    if (!authorized) {
      return await forbiddenResponse(headers)
    }

    const contactInbox = await contactInboxService.findLatestBySource({
      inboxId: webchat.inboxId,
      sourceId: data.guestConversationId,
      workspaceId: data.workspaceId,
    })

    if (!contactInbox) {
      return emptyMessagesResponse(headers)
    }

    const conversation = await conversationService.findBy({
      where: {
        workspaceId: data.workspaceId,
        contactId: contactInbox.contactId,
      },
    })

    if (!conversation) {
      return emptyMessagesResponse(headers)
    }

    const result = await listMessages({
      ...data,
      contactInboxId: contactInbox.id,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
    })

    return NextResponse.json(result, { headers })
  } catch (e) {
    return serverErrorHandler(e, corsHeaders(requestOrigin, false))
  }
}

export async function POST(req: NextRequest) {
  const requestOrigin = req.headers.get("origin")
  try {
    const data = await req.json()
    const parsedInput = createWebchatMessageRequest.parse(data)

    const webchat = await findIntegrationWebchat({
      id: parsedInput.webchatId,
      workspaceId: parsedInput.workspaceId,
    })
    const bearerToken = getBearerToken(req)
    // Bind-on-first-use: always require a token bound to the presented
    // origin, then layer the optional domain allowlist on top.
    const { authorized: tokenAuthorized } = await verifyWebchatAccessToken({
      token: parsedInput.accessToken ?? bearerToken,
      origin: parsedInput.parentOrigin,
      workspaceId: parsedInput.workspaceId,
      webchatId: parsedInput.webchatId,
    })
    const authorized =
      tokenAuthorized &&
      (webchat.authorizedDomains.length === 0 ||
        isOriginAuthorized(parsedInput.parentOrigin, webchat.authorizedDomains))
    const headers = corsHeaders(requestOrigin, authorized)
    if (!authorized) {
      return await forbiddenResponse(headers)
    }

    const message = await handleCreateWebchatMessage({
      parsedInput: {
        ...parsedInput,
        accessToken: parsedInput.accessToken ?? bearerToken ?? undefined,
      },
    })

    return NextResponse.json(
      {
        data: message,
      },
      { headers },
    )
  } catch (e) {
    return serverErrorHandler(e, corsHeaders(requestOrigin, false))
  }
}
