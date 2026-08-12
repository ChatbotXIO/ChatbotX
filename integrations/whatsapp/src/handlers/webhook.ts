import {
  type HandleRequestProps,
  type ReceivedMessageProps,
  SdkException,
} from "@chatbotx.io/sdk"
import type { OnMessageArgs, OnStatusArgs } from "whatsapp-api-js/emitters"
import { WhatsAppAPI as Middleware } from "whatsapp-api-js/middleware/next"
import type { GetParams } from "whatsapp-api-js/types"
import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import {
  type WhatsappAutomaticEventPayload,
  whatsappAutomaticEventNameSchema,
  whatsappAutomaticEventsValueSchema,
} from "../lib/automatic-events"
import { logger } from "../lib/logger"
import type { WhatsappConfig } from "../schema"

/** One buffered Coexistence history slice keyed by its phone number. */
type CoexistPayload = { phoneNumberId: string; value: unknown }
type AutomaticEventPayload = {
  phoneNumberId: string
  wabaId: string
  payload: WhatsappAutomaticEventPayload
}
type WebhookQueue = HandleRequestProps<WhatsappConfig>["queue"]

/**
 * Per Meta docs, coexist payloads arrive under three distinct `field` values
 * — not nested inside `messages`. Each field carries a differently-named
 * array on `value`:
 *
 *   field: "history"            → value.history[]            (legacy chat history)
 *   field: "smb_app_state_sync" → value.state_sync[]         (contact backfill)
 *   field: "smb_message_echoes" → value.message_echoes[]     (live SMB messages)
 *
 * Legacy `value.smb_app_state_sync` and `value.history` forms (older Meta
 * shapes) are kept as fallbacks so old samples still parse.
 */
const COEXIST_FIELD_KEY: Record<string, string> = {
  history: "history",
  smb_app_state_sync: "state_sync",
  smb_message_echoes: "message_echoes",
}

export const extractCoexistPayloads = (rawBody: unknown): CoexistPayload[] => {
  const payloads: CoexistPayload[] = []
  for (const entry of readWebhookEntries(rawBody)) {
    const changes = (entry as { changes?: unknown }).changes
    if (!Array.isArray(changes)) {
      continue
    }
    for (const change of changes) {
      const value = (change as { value?: unknown }).value
      if (typeof value !== "object" || value === null) {
        continue
      }
      const typed = value as {
        history?: unknown
        state_sync?: unknown
        message_echoes?: unknown
        smb_app_state_sync?: unknown
        metadata?: { phone_number_id?: unknown }
      }
      const field = (change as { field?: unknown }).field
      const fieldKey =
        typeof field === "string" ? COEXIST_FIELD_KEY[field] : undefined

      const isCoexist =
        (fieldKey !== undefined &&
          Array.isArray((typed as Record<string, unknown>)[fieldKey])) ||
        Array.isArray(typed.history) ||
        Array.isArray(typed.smb_app_state_sync)

      const phoneNumberId = typed.metadata?.phone_number_id
      if (isCoexist && typeof phoneNumberId === "string") {
        payloads.push({ phoneNumberId, value })
      }
    }
  }
  return payloads
}

const readWebhookEntries = (rawBody: unknown): unknown[] => {
  if (typeof rawBody !== "object" || rawBody === null) {
    return []
  }

  const entries = (rawBody as { entry?: unknown }).entry
  return Array.isArray(entries) ? entries : []
}

type AutomaticEventFieldExtractor = (props: {
  value: unknown
  wabaId: string
}) => AutomaticEventPayload[]

const automaticEventsEnvelopeSchema = whatsappAutomaticEventsValueSchema.extend(
  {
    automatic_events: z.array(z.unknown()),
  },
)

const automaticEventFieldExtractors: Record<
  string,
  AutomaticEventFieldExtractor
> = {
  automatic_events: (props: {
    value: unknown
    wabaId: string
  }): AutomaticEventPayload[] => {
    const envelope = automaticEventsEnvelopeSchema.safeParse(props.value)
    if (!envelope.success) {
      logger.warn(
        { issues: envelope.error.issues },
        "Whatsapp automatic event skipped: malformed payload",
      )
      return []
    }

    const payloads: AutomaticEventPayload[] = []
    for (const event of envelope.data.automatic_events) {
      const eventName =
        typeof event === "object" && event !== null
          ? (event as { event_name?: unknown }).event_name
          : undefined
      if (
        typeof eventName === "string" &&
        !whatsappAutomaticEventNameSchema.safeParse(eventName).success
      ) {
        logger.warn(
          { eventName },
          "Whatsapp automatic event skipped: unknown event_name",
        )
        continue
      }

      const parsed = whatsappAutomaticEventsValueSchema.safeParse({
        metadata: envelope.data.metadata,
        automatic_events: [event],
      })
      if (!parsed.success) {
        logger.warn(
          { issues: parsed.error.issues },
          "Whatsapp automatic event skipped: malformed payload",
        )
        continue
      }

      const payload = parsed.data.automatic_events[0]
      if (!payload) {
        continue
      }

      payloads.push({
        phoneNumberId: parsed.data.metadata.phone_number_id,
        wabaId: props.wabaId,
        payload,
      })
    }

    return payloads
  },
}

const toBullMqSafeIdSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_")

export const extractAutomaticEventPayloads = (
  rawBody: unknown,
): AutomaticEventPayload[] => {
  const payloads: AutomaticEventPayload[] = []

  for (const entry of readWebhookEntries(rawBody)) {
    const wabaId =
      typeof entry === "object" && entry !== null
        ? (entry as { id?: unknown }).id
        : undefined
    const changes =
      typeof entry === "object" && entry !== null
        ? (entry as { changes?: unknown }).changes
        : undefined
    if (typeof wabaId !== "string" || !Array.isArray(changes)) {
      continue
    }

    for (const change of changes) {
      if (typeof change !== "object" || change === null) {
        continue
      }

      const field = (change as { field?: unknown }).field
      const extractor =
        typeof field === "string"
          ? automaticEventFieldExtractors[field]
          : undefined
      if (!extractor) {
        continue
      }

      const extractedPayloads = extractor({
        value: (change as { value?: unknown }).value,
        wabaId,
      })
      payloads.push(...extractedPayloads)
    }
  }

  return payloads
}

const handleGetHandshake = async (
  props: HandleRequestProps<WhatsappConfig>,
  middleware: Middleware,
) => {
  const url = new URL(props.req.url)
  const params = Object.fromEntries(url.searchParams.entries()) as GetParams
  return await middleware.get(params)
}

const readVerifiedPostPayloads = async (
  req: Request,
): Promise<{
  rawBodyBuffer: ArrayBuffer
  coexistPayloads: CoexistPayload[]
  automaticEventPayloads: AutomaticEventPayload[]
}> => {
  let rawBodyBuffer = new ArrayBuffer(0)
  let rawBodyText = ""
  let coexistPayloads: CoexistPayload[] = []
  let automaticEventPayloads: AutomaticEventPayload[] = []
  try {
    rawBodyBuffer = await req.arrayBuffer()
    rawBodyText = new TextDecoder().decode(rawBodyBuffer)
    const rawBody = JSON.parse(rawBodyText) as unknown
    coexistPayloads = extractCoexistPayloads(rawBody)
    try {
      automaticEventPayloads = extractAutomaticEventPayloads(rawBody)
    } catch (err) {
      logger.error(
        { err },
        "Whatsapp automatic event extraction failed; webhook will still acknowledge",
      )
    }
  } catch {
    logger.debug("Whatsapp webhook raw body was not JSON; continuing")
  }

  return { rawBodyBuffer, coexistPayloads, automaticEventPayloads }
}

const capturePostResult = async (input: {
  req: Request
  rawBodyBuffer: ArrayBuffer
  middleware: Middleware
}): Promise<
  | { type: "message"; data: OnMessageArgs }
  | { type: "status"; data: OnStatusArgs }
  | null
> => {
  const reqWithBody = new Request(input.req.url, {
    method: input.req.method,
    headers: input.req.headers,
    body: input.rawBodyBuffer.byteLength > 0 ? input.rawBodyBuffer : undefined,
  })

  // Start handle_post immediately; attach a no-op catch so any rejection
  // that arrives after we've already resolved the race is silently absorbed
  // (we re-check the outcome below via the full await).
  const handlePostPromise = input.middleware.handle_post(reqWithBody)
  handlePostPromise.catch(() => {
    /* absorbed — re-checked below */
  })

  const result = await new Promise<
    | { type: "message"; data: OnMessageArgs }
    | { type: "status"; data: OnStatusArgs }
    | null
  >((resolve) => {
    input.middleware.on.message = (args: OnMessageArgs) => {
      resolve({ type: "message", data: args })
    }
    input.middleware.on.sent = () => {
      resolve(null)
    }
    input.middleware.on.status = (args: OnStatusArgs) => {
      resolve({ type: "status", data: args })
    }

    // 300 ms guard: resolve with null so callers aren't blocked forever.
    setTimeout(() => {
      resolve(null)
    }, 300)
  })

  // Always await handle_post to completion so hmacVerified reflects the
  // actual HMAC outcome — even if the middleware callbacks fired first or
  // the 300 ms guard already resolved the inner promise above.
  const handlePostStatus = await handlePostPromise
  if (handlePostStatus !== 200) {
    throw new SdkException("Failed to handle webhook")
  }

  return result
}

const enqueueCoexistPayloads = async (
  queue: WebhookQueue,
  coexistPayloads: CoexistPayload[],
): Promise<void> => {
  if (coexistPayloads.length > 0) {
    for (const { phoneNumberId, value } of coexistPayloads) {
      await queue?.add("coexistWhatsappBuffer", {
        type: "coexistWhatsappBuffer",
        data: { phoneNumberId, payload: value },
      })
    }
  }
}

const enqueueAutomaticEventPayloads = async (
  queue: WebhookQueue,
  automaticEventPayloads: AutomaticEventPayload[],
): Promise<void> => {
  // HIGH-6: the try/catch is per-event, not around the whole loop — one
  // failed enqueue is logged and skipped without aborting the rest of the
  // batch. The webhook still ACKs Meta either way, so a loop-wide catch used
  // to silently drop every event after the first failure.
  for (const { phoneNumberId, wabaId, payload } of automaticEventPayloads) {
    try {
      await queue?.add(
        "adsAutomaticEvent",
        {
          type: "adsAutomaticEvent",
          data: {
            integrationType: "whatsapp",
            integrationIdentifier: phoneNumberId,
            phoneNumberId,
            wabaId,
            payload,
          },
        },
        {
          jobId: `ads-auto-${toBullMqSafeIdSegment(phoneNumberId)}-${toBullMqSafeIdSegment(payload.id)}`,
        },
      )
    } catch (err) {
      logger.error(
        { err, phoneNumberId, eventId: payload.id },
        "Whatsapp automatic event enqueue failed; webhook will still acknowledge",
      )
    }
  }
}

const dispatchWebhookResult = async (
  queue: WebhookQueue,
  result:
    | { type: "message"; data: OnMessageArgs }
    | { type: "status"; data: OnStatusArgs }
    | null,
): Promise<void> => {
  if (result?.type === "message" && result.data.message) {
    await queue?.add("incomingMessage", {
      type: "incomingMessage",
      data: {
        integrationType: "whatsapp",
        integrationIdentifier: result.data.phoneID,
        payload: result.data,
      } as ReceivedMessageProps,
    })
  }

  if (result?.type === "status") {
    const statusData = result.data

    if (
      statusData.status === "delivered" ||
      statusData.status === "failed" ||
      statusData.status === "read"
    ) {
      await queue?.add("messageStatus", {
        type: "messageStatus",
        data: {
          integrationIdentifier: result.data.phoneID,
          integrationType: "whatsapp",
          payload: {
            phoneID: result.data.phoneID,
            phone: result.data.phone,
            messageId: statusData.id,
            status: statusData.status,
            timestamp: statusData.timestamp,
            error: result.data.error,
          },
        },
      })
    }
  }
}

export const webhookHandler = async (
  props: HandleRequestProps<WhatsappConfig>,
) => {
  const { version = DEFAULT_API_VERSION } = props.config
  const middleware = new Middleware({
    token: "",
    webhookVerifyToken: props.config.verifyToken as string,
    v: version as string,
    secure: false,
  })

  if (props.req.method === "GET") {
    return await handleGetHandshake(props, middleware)
  }

  if (props.req.method === "POST") {
    try {
      // Read the body once as raw bytes — HTTP body is a one-shot stream.
      // Using arrayBuffer() preserves the exact bytes for HMAC verification;
      // text() would silently re-encode, risking a signature mismatch on
      // non-ASCII payloads. We decode to string only for JSON parsing.
      const { rawBodyBuffer, coexistPayloads, automaticEventPayloads } =
        await readVerifiedPostPayloads(props.req)
      const result = await capturePostResult({
        req: props.req,
        rawBodyBuffer,
        middleware,
      })
      await enqueueCoexistPayloads(props.queue, coexistPayloads)
      await enqueueAutomaticEventPayloads(props.queue, automaticEventPayloads)
      await dispatchWebhookResult(props.queue, result)

      return "ok"
    } catch {
      throw new SdkException("Failed to handle webhook")
    }
  }

  throw SdkException.methodNotImplemented()
}
