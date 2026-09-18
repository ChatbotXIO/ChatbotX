import { whatsappVoipSignalingService } from "@chatbotx.io/business"
import {
  type HandleRequestProps,
  type ReceivedMessageProps,
  SdkException,
} from "@chatbotx.io/sdk"
import { sha256Hex, verifyHmacSha256Signature } from "@chatbotx.io/utils/crypto"
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
import {
  extractCallEventPayloads,
  type WhatsappCallEventPayload,
} from "../lib/calls"
import { logger } from "../lib/logger"
import { extractWhatsappStatusRecipientUserId } from "../lib/raw-identity"
import { resolveSignaturePolicy } from "../lib/signature-policy"
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

/**
 * The phone number id the calling route pinned, if any. The per-integration
 * manual route pins its own number because it may be unsigned — otherwise a
 * forged payload could name another workspace's number. The shared platform
 * route is always HMAC-verified and multiplexes many numbers, so it pins
 * nothing.
 */
const resolvePinnedPhoneNumberId = (
  config: WhatsappConfig,
): string | undefined => {
  const pinned = config.phoneNumberId
  return typeof pinned === "string" && pinned.length > 0 ? pinned : undefined
}

/**
 * Drops items for any other number when one is pinned, logging each so a forged
 * or misrouted webhook stays visible. No-op when nothing is pinned.
 */
const dropMismatchedPhoneNumberId = <T extends { phoneNumberId: string }>(
  items: T[],
  pinnedPhoneNumberId: string | undefined,
  context: string,
): T[] => {
  if (!pinnedPhoneNumberId) {
    return items
  }
  return items.filter((item) => {
    if (item.phoneNumberId === pinnedPhoneNumberId) {
      return true
    }
    logger.warn(
      {
        context,
        pinnedPhoneNumberId,
        receivedPhoneNumberId: item.phoneNumberId,
      },
      "Whatsapp webhook change dropped: phone_number_id does not match the route-loaded integration",
    )
    return false
  })
}

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

/**
 * A `messages` change value. `whatsapp-api-js@6.2.1`'s `post()` only reads
 * `entry[0].changes[0].messages[0]`, so a batched delivery must be fed to it
 * one item at a time.
 */
type MessagesChangeValue = {
  messages?: unknown[]
  statuses?: unknown[]
  contacts?: unknown[]
  metadata?: { phone_number_id?: unknown }
  [key: string]: unknown
}

/**
 * Splits a `messages` change into one value per `messages[]`/`statuses[]` item,
 * each with its own contact. Other shapes are returned unchanged.
 */
const readStringField = (value: unknown, key: string): string | undefined => {
  const field =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined
  return typeof field === "string" && field.length > 0 ? field : undefined
}

/**
 * The contact for one message of a batch, matched by identity
 * (`wa_id`/`user_id`), not position — Meta does not guarantee index alignment
 * and the SDK prefers `contact.wa_id` over `message.from`. Falls back to the
 * single contact of a single-contact change, and to position only for an equal-
 * length batch of unidentifiable messages.
 */
const pickContactsForMessage = (
  contacts: unknown[] | undefined,
  message: unknown,
  index: number,
): unknown[] | undefined => {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return contacts
  }
  const from = readStringField(message, "from")
  const fromUserId = readStringField(message, "from_user_id")
  const matched = contacts.find(
    (contact) =>
      (from !== undefined && readStringField(contact, "wa_id") === from) ||
      (fromUserId !== undefined &&
        readStringField(contact, "user_id") === fromUserId),
  )
  if (matched !== undefined) {
    return [matched]
  }
  if (from === undefined && fromUserId === undefined) {
    return contacts.length === 1 ? contacts : contacts.slice(index, index + 1)
  }
  return
}

const splitMessagesChangeValue = (
  value: MessagesChangeValue,
): MessagesChangeValue[] => {
  const results: MessagesChangeValue[] = []

  if (Array.isArray(value.messages)) {
    for (const [index, message] of value.messages.entries()) {
      results.push({
        ...value,
        messages: [message],
        statuses: undefined,
        contacts: pickContactsForMessage(value.contacts, message, index),
      })
    }
  }

  if (Array.isArray(value.statuses)) {
    for (const status of value.statuses) {
      results.push({ ...value, statuses: [status], messages: undefined })
    }
  }

  return results.length > 0 ? results : [value]
}

/**
 * One full webhook body per `messages` item, to feed the SDK once per item.
 * `calls` changes are excluded (handled by `extractCallEventPayloads`); items
 * for a non-pinned number are dropped before the SDK.
 */
const buildMessagesChangeBuffers = (
  rawBody: unknown,
  pinnedPhoneNumberId: string | undefined,
): ArrayBuffer[] => {
  const object =
    typeof rawBody === "object" && rawBody !== null
      ? (rawBody as { object?: unknown }).object
      : undefined
  const encoder = new TextEncoder()
  const buffers: ArrayBuffer[] = []

  for (const entry of readWebhookEntries(rawBody)) {
    const entryObj = entry as { id?: unknown; changes?: unknown }
    const changes = entryObj.changes
    if (!Array.isArray(changes)) {
      continue
    }
    for (const change of changes) {
      if (
        typeof change !== "object" ||
        change === null ||
        (change as { field?: unknown }).field !== "messages"
      ) {
        continue
      }
      const value = (change as { value?: unknown }).value
      if (typeof value !== "object" || value === null) {
        continue
      }
      const typedValue = value as MessagesChangeValue
      const phoneNumberId = typedValue.metadata?.phone_number_id
      if (
        pinnedPhoneNumberId &&
        (typeof phoneNumberId !== "string" ||
          phoneNumberId !== pinnedPhoneNumberId)
      ) {
        logger.warn(
          {
            context: "messages",
            pinnedPhoneNumberId,
            receivedPhoneNumberId: phoneNumberId,
          },
          "Whatsapp webhook change dropped: phone_number_id does not match the route-loaded integration",
        )
        continue
      }

      for (const singleValue of splitMessagesChangeValue(typedValue)) {
        const body = {
          object,
          entry: [
            {
              id: entryObj.id,
              changes: [{ field: "messages", value: singleValue }],
            },
          ],
        }
        buffers.push(encoder.encode(JSON.stringify(body)).buffer as ArrayBuffer)
      }
    }
  }

  return buffers
}

/**
 * Parses the verified body into payloads to enqueue. Never throws, so the
 * webhook can still ACK Meta.
 */
const parsePostPayloads = (
  rawBodyBuffer: ArrayBuffer,
  pinnedPhoneNumberId: string | undefined,
): {
  coexistPayloads: CoexistPayload[]
  automaticEventPayloads: AutomaticEventPayload[]
  callEventPayloads: WhatsappCallEventPayload[]
  messagesChangeBuffers: ArrayBuffer[]
} => {
  let coexistPayloads: CoexistPayload[] = []
  let automaticEventPayloads: AutomaticEventPayload[] = []
  let callEventPayloads: WhatsappCallEventPayload[] = []
  let messagesChangeBuffers: ArrayBuffer[] = []
  try {
    const rawBodyText = new TextDecoder().decode(rawBodyBuffer)
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
    try {
      callEventPayloads = extractCallEventPayloads(rawBody)
    } catch (err) {
      logger.error(
        { err },
        "Whatsapp call event extraction failed; webhook will still acknowledge",
      )
    }
    messagesChangeBuffers = buildMessagesChangeBuffers(
      rawBody,
      pinnedPhoneNumberId,
    )
  } catch {
    logger.debug("Whatsapp webhook raw body was not JSON; continuing")
  }

  return {
    coexistPayloads,
    automaticEventPayloads,
    callEventPayloads,
    messagesChangeBuffers,
  }
}

const HUB_SIGNATURE_HEADER = "x-hub-signature-256"

type SignatureVerificationOutcome =
  | { verified: true; rawBodyBuffer: ArrayBuffer }
  | {
      verified: false
      rawBodyBuffer: ArrayBuffer
      reason: "missing-secret" | "missing-signature" | "invalid-signature"
    }

/**
 * Reads the raw body once and, per `resolveSignaturePolicy`, verifies `X-Hub-
 * Signature-256` before anything else (`enforce`) or accepts it unverified with
 * a log line for a manual integration without an app secret (`legacy-
 * unverified`).
 */
const verifyPostSignature = async (
  req: Request,
  config: WhatsappConfig,
): Promise<SignatureVerificationOutcome> => {
  const rawBodyBuffer = await req.arrayBuffer()
  const policy = resolveSignaturePolicy(config)

  if (policy === "legacy-unverified") {
    logger.warn(
      {
        reason: "manual-integration-without-app-secret",
        integrationId: config.integrationId,
      },
      "Whatsapp webhook accepted unverified: manual integration has no app secret configured",
    )
    return { verified: true, rawBodyBuffer }
  }

  const clientSecret = config.clientSecret
  if (!clientSecret) {
    return { verified: false, rawBodyBuffer, reason: "missing-secret" }
  }

  const signatureHeader = req.headers.get(HUB_SIGNATURE_HEADER)
  if (!signatureHeader) {
    return { verified: false, rawBodyBuffer, reason: "missing-signature" }
  }

  const isValid = await verifyHmacSha256Signature({
    rawBody: new Uint8Array(rawBodyBuffer),
    secret: clientSecret,
    signatureHeader,
  })
  if (!isValid) {
    return { verified: false, rawBodyBuffer, reason: "invalid-signature" }
  }

  return { verified: true, rawBodyBuffer }
}

/**
 * `whatsapp-api-js@6.2.1` fires these callbacks synchronously inside
 * `handle_post`, so once it resolves every callback has already run.
 */
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

  let captured:
    | { type: "message"; data: OnMessageArgs }
    | { type: "status"; data: OnStatusArgs }
    | null = null

  input.middleware.on.message = (args: OnMessageArgs) => {
    captured = { type: "message", data: args }
  }
  input.middleware.on.sent = () => {
    captured = null
  }
  input.middleware.on.status = (args: OnStatusArgs) => {
    captured = { type: "status", data: args }
  }

  const handlePostStatus = await input.middleware.handle_post(reqWithBody)
  if (handlePostStatus !== 200) {
    throw new SdkException("Failed to handle webhook")
  }

  return captured
}

/**
 * Deterministic jobId so a whole-webhook redelivery re-adds nothing. Web Crypto
 * keeps this module edge-safe. A failure propagates: coexist payloads arrive
 * only once, so Meta must redeliver.
 */
const enqueueCoexistPayloads = async (
  queue: WebhookQueue,
  coexistPayloads: CoexistPayload[],
): Promise<void> => {
  for (const { phoneNumberId, value } of coexistPayloads) {
    const payloadHash = await sha256Hex(JSON.stringify(value))
    await queue?.add(
      "coexistWhatsappBuffer",
      {
        type: "coexistWhatsappBuffer",
        data: { phoneNumberId, payload: value },
      },
      {
        jobId: `wa-coexist-${toBullMqSafeIdSegment(phoneNumberId)}-${payloadHash}`,
        ...REDELIVERABLE_JOB_OPTIONS,
      },
    )
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

const callEventJobIdSuffix = (
  event: WhatsappCallEventPayload["event"],
): string => {
  if (event.kind === "status") {
    return `${event.kind}-${event.status}`
  }
  return event.kind
}

/**
 * Terminate jobs are delayed slightly so interim status jobs commit first — the
 * terminate labels a FAILED call "declined" only if it sees REJECTED. The
 * worker also lets a late REJECTED upgrade `failed`, so this is a fast path,
 * not the only defense.
 */
const TERMINATE_JOB_DELAY_MS = 2000

/**
 * Call jobs retry longer than the default (the webhook is already ACKed, so a
 * dropped job loses the call), and failed jobs age out so their jobId does not
 * block a later redelivery.
 */
const CALL_EVENT_JOB_RETRY_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnFail: { age: 6 * 60 * 60 },
} as const

/**
 * The generic call-event job must never carry the SDP offer (it goes to Redis
 * and the signaling queue instead). The event is rebuilt explicitly so
 * `session` is truly absent at runtime.
 */
const stripVoipSession = (
  event: WhatsappCallEventPayload["event"],
): WhatsappCallEventPayload["event"] => {
  if (event.kind !== "connect" || !event.session) {
    return event
  }
  const { session: _session, ...rest } = event
  return rest
}

/**
 * Enqueue failures propagate so the route answers non-2xx and Meta redelivers;
 * deterministic jobIds make that safe.
 */
const enqueueCallEventPayloads = async (
  queue: WebhookQueue,
  callEventPayloads: WhatsappCallEventPayload[],
): Promise<void> => {
  for (const payload of callEventPayloads) {
    try {
      await queue?.add(
        "whatsappCallEvent",
        {
          type: "whatsappCallEvent",
          data: {
            integrationType: "whatsapp",
            integrationIdentifier: payload.phoneNumberId,
            payload: { ...payload, event: stripVoipSession(payload.event) },
          },
        },
        {
          // One job per call id per lifecycle step, deduping redeliveries.
          jobId: `wa-call-${toBullMqSafeIdSegment(payload.event.wacid)}-${callEventJobIdSuffix(payload.event)}`,
          ...CALL_EVENT_JOB_RETRY_OPTIONS,
          ...(payload.event.kind === "terminate"
            ? { delay: TERMINATE_JOB_DELAY_MS }
            : {}),
        },
      )
    } catch (err) {
      logger.error(
        {
          err,
          phoneNumberId: payload.phoneNumberId,
          wacid: payload.event.wacid,
        },
        "Whatsapp call event enqueue failed",
      )
      throw err
    }
  }
}

/**
 * How far a connect timestamp may be from our clock and still be trusted — a
 * day absorbs skew and backlog but rejects milliseconds or placeholders.
 */
const CONNECT_TIMESTAMP_TOLERANCE_MS = 24 * 60 * 60 * 1000

/**
 * Meta's webhook timestamp in Unix seconds, or `undefined` (use the clock) when
 * missing or implausible — otherwise call hours would be judged against the
 * wrong year.
 */
const metaTimestampToEpochMs = (timestamp?: string): number | undefined => {
  const seconds = Number(timestamp)
  if (!(timestamp && Number.isFinite(seconds)) || seconds <= 0) {
    return
  }
  const epochMs = seconds * 1000
  return Math.abs(epochMs - Date.now()) > CONNECT_TIMESTAMP_TOLERANCE_MS
    ? undefined
    : epochMs
}

/**
 * VoIP connect branch, in addition to the generic call event (which still
 * creates the row and trigger). Runs only for a validated `session` on an
 * inbound connect. Failures propagate so Meta redelivers; the service calls are
 * idempotent.
 */
const enqueueVoipConnectSignaling = async (
  callEventPayloads: WhatsappCallEventPayload[],
): Promise<void> => {
  for (const payload of callEventPayloads) {
    const { event } = payload
    if (event.kind !== "connect") {
      continue
    }
    if (event.direction === "businessInitiated") {
      // A business-initiated connect carries the customer's answer to our own
      // offer — never route it into the inbound path, which would reject our
      // own dial.
      if (event.session?.sdpType === "answer") {
        if (!event.bizOpaqueCallbackData) {
          logger.warn(
            { phoneNumberId: payload.phoneNumberId, wacid: event.wacid },
            "Whatsapp outbound answer: bizOpaqueCallbackData missing; falling back to wacid lookup",
          )
        }
        try {
          await whatsappVoipSignalingService.captureOutboundAnswer({
            attemptId: event.bizOpaqueCallbackData ?? "",
            wacid: event.wacid,
            sdp: event.session.sdp,
          })
        } catch (err) {
          logger.error(
            { err, phoneNumberId: payload.phoneNumberId, wacid: event.wacid },
            "Whatsapp outbound answer capture failed",
          )
          throw err
        }
      }
      continue
    }
    // Meta's own timestamp, so call hours are judged at ring time and stay
    // stable across redeliveries.
    const receivedAt = metaTimestampToEpochMs(event.timestamp)
    try {
      if (event.session) {
        await whatsappVoipSignalingService.captureConnectOffer({
          wacid: event.wacid,
          sdp: event.session.sdp,
          phoneNumberId: payload.phoneNumberId,
          receivedAt,
        })
      } else if (event.sessionInvalid) {
        // An SDP we cannot honor — reject it at Meta rather than let it ring
        // out.
        await whatsappVoipSignalingService.rejectUnprocessableConnect({
          wacid: event.wacid,
          phoneNumberId: payload.phoneNumberId,
          receivedAt,
        })
      }
    } catch (err) {
      logger.error(
        { err, phoneNumberId: payload.phoneNumberId, wacid: event.wacid },
        "Whatsapp VoIP connect signaling enqueue failed",
      )
      throw err
    }
  }
}

/**
 * Meta-native recording/transcript delivery, in addition to the generic call
 * event. Failures propagate so Meta redelivers.
 */
const enqueueNativeCallCapture = async (
  callEventPayloads: WhatsappCallEventPayload[],
): Promise<void> => {
  for (const payload of callEventPayloads) {
    const { event } = payload

    if (event.kind === "recordingAvailable") {
      logger.info(
        {
          phoneNumberId: payload.phoneNumberId,
          wacid: event.wacid,
          mimeType: event.audio.mimeType,
          hasAudioUrl: Boolean(event.audio.url),
        },
        "[wa-call-recording] webhook call_recording_available received",
      )
      if (!(event.audio.url && event.audio.mimeType)) {
        logger.warn(
          { phoneNumberId: payload.phoneNumberId, wacid: event.wacid },
          "Whatsapp native call recording skipped: missing audio url/mimeType",
        )
        continue
      }
      try {
        await whatsappVoipSignalingService.captureNativeRecordingAvailable({
          wacid: event.wacid,
          audioMediaId: event.audio.mediaId,
          audioUrl: event.audio.url,
          mimeType: event.audio.mimeType,
        })
      } catch (err) {
        logger.error(
          { err, phoneNumberId: payload.phoneNumberId, wacid: event.wacid },
          "Whatsapp native call recording capture failed",
        )
        throw err
      }
      continue
    }

    if (event.kind === "transcriptionAvailable") {
      logger.info(
        {
          phoneNumberId: payload.phoneNumberId,
          wacid: event.wacid,
          hasDocumentUrl: Boolean(event.document.url),
        },
        "[wa-call-transcript] webhook call_transcription_available received",
      )
      if (!event.document.url) {
        logger.warn(
          { phoneNumberId: payload.phoneNumberId, wacid: event.wacid },
          "Whatsapp native call transcript skipped: missing document url",
        )
        continue
      }
      try {
        await whatsappVoipSignalingService.captureNativeTranscriptAvailable({
          wacid: event.wacid,
          documentMediaId: event.document.mediaId,
          documentUrl: event.document.url,
        })
      } catch (err) {
        logger.error(
          { err, phoneNumberId: payload.phoneNumberId, wacid: event.wacid },
          "Whatsapp native call transcript capture failed",
        )
        throw err
      }
    }
  }
}

/**
 * Remove a deterministic-jobId job as soon as it fails: BullMQ keeps failed
 * jobs under their id, which would swallow the redelivery meant to reprocess
 * it. Completed jobs stay and keep deduping.
 */
const REDELIVERABLE_JOB_OPTIONS = { removeOnFail: true } as const

const dispatchWebhookResult = async (
  queue: WebhookQueue,
  result:
    | { type: "message"; data: OnMessageArgs }
    | { type: "status"; data: OnStatusArgs }
    | null,
): Promise<void> => {
  if (result?.type === "message" && result.data.message) {
    await queue?.add(
      "incomingMessage",
      {
        type: "incomingMessage",
        data: {
          integrationType: "whatsapp",
          integrationIdentifier: result.data.phoneID,
          payload: result.data,
        } as ReceivedMessageProps,
      },
      {
        // Deterministic jobId so a Meta redelivery re-adds nothing; the message
        // row also dedupes by sourceId.
        jobId: `wa-msg-${toBullMqSafeIdSegment(result.data.phoneID)}-${toBullMqSafeIdSegment(result.data.message.id)}`,
        ...REDELIVERABLE_JOB_OPTIONS,
      },
    )
  }

  if (result?.type === "status") {
    const statusData = result.data

    if (
      statusData.status === "delivered" ||
      statusData.status === "failed" ||
      statusData.status === "read"
    ) {
      await queue?.add(
        "messageStatus",
        {
          type: "messageStatus",
          data: {
            integrationIdentifier: result.data.phoneID,
            integrationType: "whatsapp",
            payload: {
              phoneID: result.data.phoneID,
              phone: result.data.phone,
              recipientUserId: extractWhatsappStatusRecipientUserId(
                result.data.raw,
              ),
              messageId: statusData.id,
              status: statusData.status,
              timestamp: statusData.timestamp,
              error: result.data.error,
            },
          },
        },
        {
          // Deterministic jobId — see the `incomingMessage` comment above.
          jobId: `wa-status-${toBullMqSafeIdSegment(result.data.phoneID)}-${toBullMqSafeIdSegment(statusData.id)}-${toBullMqSafeIdSegment(statusData.status)}`,
          ...REDELIVERABLE_JOB_OPTIONS,
        },
      )
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
    // Read the body once as bytes: re-encoding as text could break the HMAC on
    // non-ASCII payloads. Verify before any parsing or enqueueing.
    const signatureOutcome = await verifyPostSignature(props.req, props.config)

    if (!signatureOutcome.verified) {
      logger.warn(
        {
          reason: signatureOutcome.reason,
          isManualIntegration: Boolean(props.config.manualIntegration),
        },
        "Whatsapp webhook rejected: signature verification failed",
      )
      throw new SdkException(
        "Whatsapp webhook signature verification failed",
        undefined,
        401,
      )
    }

    logger.info(
      { contentLength: signatureOutcome.rawBodyBuffer.byteLength },
      "Whatsapp webhook request body",
    )

    try {
      const pinnedPhoneNumberId = resolvePinnedPhoneNumberId(props.config)
      const {
        coexistPayloads,
        automaticEventPayloads,
        callEventPayloads,
        messagesChangeBuffers,
      } = parsePostPayloads(signatureOutcome.rawBodyBuffer, pinnedPhoneNumberId)

      const boundCoexistPayloads = dropMismatchedPhoneNumberId(
        coexistPayloads,
        pinnedPhoneNumberId,
        "coexist",
      )
      const boundAutomaticEventPayloads = dropMismatchedPhoneNumberId(
        automaticEventPayloads,
        pinnedPhoneNumberId,
        "automaticEvent",
      )
      const boundCallEventPayloads = dropMismatchedPhoneNumberId(
        callEventPayloads,
        pinnedPhoneNumberId,
        "callEvent",
      )

      // Feed the SDK one single-item body per `messages` item — it only reads
      // the first item. `calls` changes never reach it, which also avoids its
      // crash on a contact with no `profile`.
      const results: Array<
        | { type: "message"; data: OnMessageArgs }
        | { type: "status"; data: OnStatusArgs }
        | null
      > = []
      // Per-item try/catch: parsing is deterministic, so one bad item must not
      // fail the whole delivery and trap Meta in endless redelivery.
      for (const [index, buffer] of messagesChangeBuffers.entries()) {
        try {
          results.push(
            await capturePostResult({
              req: props.req,
              rawBodyBuffer: buffer,
              middleware,
            }),
          )
        } catch (err) {
          logger.error(
            { err, itemIndex: index, pinnedPhoneNumberId },
            "Whatsapp webhook item skipped: the SDK middleware could not parse it",
          )
          results.push(null)
        }
      }

      // Enqueues that propagate (and are jobId-deduped) run first; coexist and
      // automatic events log-and-skip, so they run last.
      await enqueueCallEventPayloads(props.queue, boundCallEventPayloads)
      await enqueueVoipConnectSignaling(boundCallEventPayloads)
      await enqueueNativeCallCapture(boundCallEventPayloads)
      for (const result of results) {
        await dispatchWebhookResult(props.queue, result)
      }
      await enqueueCoexistPayloads(props.queue, boundCoexistPayloads)
      await enqueueAutomaticEventPayloads(
        props.queue,
        boundAutomaticEventPayloads,
      )

      return "ok"
    } catch (err) {
      // Keep the underlying error so a failure is diagnosable.
      logger.error({ err }, "Whatsapp webhook handler failed")
      throw new SdkException("Failed to handle webhook")
    }
  }

  throw SdkException.methodNotImplemented
}
