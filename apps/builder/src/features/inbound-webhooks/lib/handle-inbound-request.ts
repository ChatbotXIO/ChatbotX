import { isIP } from "node:net"
import {
  inboundWebhookService,
  resolveWorkspaceFreezeReasonById,
} from "@chatbotx.io/business"
import { toLoggableDatabaseError } from "@chatbotx.io/database/client"
import {
  INBOUND_WEBHOOK_LIMITS,
  INBOUND_WEBHOOK_TOKEN_PREFIX,
} from "@chatbotx.io/database/partials"
import { isJsonbStorable } from "@chatbotx.io/utils/json-path"
import { enqueueProcessInboundWebhookRequest } from "@chatbotx.io/worker-config"
import { logger } from "@/lib/log"
import { checkApiRateLimit } from "@/lib/rate-limit/api-rate-limit"
import {
  getGuestClientIp,
  UNKNOWN_CLIENT_IP,
} from "@/lib/rate-limit/guest-rate-limit"
import {
  INBOUND_WEBHOOK_ERROR_CODE,
  type InboundWebhookErrorCode,
} from "./error-codes"

const TOKEN_SHAPE = new RegExp(
  `^${INBOUND_WEBHOOK_TOKEN_PREFIX}[A-Za-z0-9_-]{32,64}$`,
)
const IDEMPOTENCY_KEY_HEADER = "idempotency-key"

/** Per 10-second window, see `checkApiRateLimit`. */
const PREAUTH_LIMIT_PER_IP = 300
// Callers behind a proxy that sets no client-IP header all share one bucket, so
// it needs head-room, but must still exist: without it an invalid-token flood
// would be unbounded.
const PREAUTH_LIMIT_UNKNOWN_IP = 1500
const WEBHOOK_LIMIT = 600

type InboundResponse = {
  status: number
  body: Record<string, unknown>
  headers?: Record<string, string>
}

const respond = (
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): InboundResponse => ({ status, body, headers })

const failure = (
  status: number,
  code: InboundWebhookErrorCode,
  message: string,
  headers?: Record<string, string>,
) => respond(status, { accepted: false, code, message }, headers)

/** Reads the body, giving up as soon as it exceeds the cap (declared or streamed). */
const readBodyWithLimit = async (
  request: Request,
  maxBytes: number,
): Promise<string | null> => {
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) {
    return null
  }
  if (!request.body) {
    return ""
  }
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      return text + decoder.decode()
    }
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      return null
    }
    text += decoder.decode(value, { stream: true })
  }
}

const parseJsonBody = (rawBody: string): unknown | undefined => {
  try {
    const parsed: unknown = JSON.parse(rawBody)
    return typeof parsed === "object" &&
      parsed !== null &&
      isJsonbStorable(parsed)
      ? parsed
      : undefined
  } catch {
    return
  }
}

const rateLimited = (retryAfter: number): InboundResponse =>
  failure(429, INBOUND_WEBHOOK_ERROR_CODE.rateLimited, "Too many requests", {
    "Retry-After": String(retryAfter),
  })

const readIdempotencyKey = (request: Request): string | null | undefined => {
  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim()
  if (!key) {
    return null
  }
  return key.length <= INBOUND_WEBHOOK_LIMITS.maxIdempotencyKeyLength
    ? key
    : undefined
}

/**
 * Accepts one delivery: authenticate by token, bound abuse and size, store the
 * request durably, hand it to the worker, and answer. Everything slow (contact
 * work, actions) happens in the worker. The token, URL and payload are never
 * logged.
 */
export const handleInboundWebhookRequest = async (input: {
  token: string
  request: Request
}): Promise<InboundResponse> => {
  const { token, request } = input
  if (!TOKEN_SHAPE.test(token)) {
    return failure(
      404,
      INBOUND_WEBHOOK_ERROR_CODE.notFound,
      "Webhook not found",
    )
  }

  const clientIp = getGuestClientIp(request.headers)
  const preauth = await checkApiRateLimit({
    scope: "inbound-webhook-preauth-rate-limit",
    key: clientIp,
    limit:
      clientIp === UNKNOWN_CLIENT_IP
        ? PREAUTH_LIMIT_UNKNOWN_IP
        : PREAUTH_LIMIT_PER_IP,
  })
  if (preauth.limited) {
    return rateLimited(preauth.retryAfter)
  }

  const rawBody = await readBodyWithLimit(
    request,
    INBOUND_WEBHOOK_LIMITS.maxPayloadBytes,
  )
  if (rawBody === null) {
    return failure(
      413,
      INBOUND_WEBHOOK_ERROR_CODE.payloadTooLarge,
      "The request body is too large",
    )
  }

  const webhook = await inboundWebhookService.findByToken(token)
  if (!webhook) {
    return failure(
      404,
      INBOUND_WEBHOOK_ERROR_CODE.notFound,
      "Webhook not found",
    )
  }
  // The worker skips a blocked owner's jobs, so accepting their deliveries
  // would only pile up requests nobody can process.
  const { freezeReason } = await resolveWorkspaceFreezeReasonById(
    webhook.workspaceId,
  )
  if (freezeReason === "ownerBlocked") {
    return failure(
      403,
      INBOUND_WEBHOOK_ERROR_CODE.workspaceBlocked,
      "This webhook is not available",
    )
  }
  if (freezeReason) {
    return failure(
      410,
      INBOUND_WEBHOOK_ERROR_CODE.workspaceUnavailable,
      "This webhook is no longer available",
    )
  }
  if (!(webhook.active && webhook.isConfigured)) {
    return failure(
      403,
      INBOUND_WEBHOOK_ERROR_CODE.webhookInactive,
      "This webhook is not active",
    )
  }

  const perWebhook = await checkApiRateLimit({
    scope: "inbound-webhook-rate-limit",
    key: webhook.id,
    limit: WEBHOOK_LIMIT,
  })
  if (perWebhook.limited) {
    return rateLimited(perWebhook.retryAfter)
  }

  const payload = parseJsonBody(rawBody)
  if (payload === undefined) {
    return failure(
      400,
      INBOUND_WEBHOOK_ERROR_CODE.invalidJson,
      "The body must be a JSON object or array",
    )
  }
  const idempotencyKey = readIdempotencyKey(request)
  if (idempotencyKey === undefined) {
    return failure(
      400,
      INBOUND_WEBHOOK_ERROR_CODE.invalidIdempotencyKey,
      "Idempotency-Key is too long",
    )
  }

  const recorded = await inboundWebhookService.recordRequest({
    webhook,
    payload,
    idempotencyKey,
    clientInfo: {
      // Audit data only. The header is whatever the proxy forwarded, so it is
      // kept only when it is an address at all — never as free text.
      clientIp: isIP(clientIp) === 0 ? null : clientIp,
      userAgent:
        request.headers
          .get("user-agent")
          ?.slice(0, INBOUND_WEBHOOK_LIMITS.maxUserAgentLength) || null,
    },
  })
  if (recorded.duplicate) {
    return respond(200, { accepted: true, duplicate: true })
  }

  const requestId = recorded.request.id
  try {
    await enqueueProcessInboundWebhookRequest({
      workspaceId: webhook.workspaceId,
      inboundWebhookId: webhook.id,
      requestId,
    })
  } catch (err) {
    // The row is the outbox: the re-dispatch cron enqueues it shortly, so the
    // delivery is still accepted — the sender must not retry and duplicate it.
    logger.warn(
      {
        err: toLoggableDatabaseError(err),
        inboundWebhookId: webhook.id,
        requestId,
      },
      "Could not enqueue an inbound webhook request; the sweep will",
    )
  }
  return respond(202, { accepted: true, requestId })
}
