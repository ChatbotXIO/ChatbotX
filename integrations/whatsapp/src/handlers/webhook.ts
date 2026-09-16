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
 * Reads the phone number id the CALLING route has pinned this
 * request to, when one was pinned.
 *
 * Two routes call into this handler:
 *  - The per-integration MANUAL webhook route
 *    (`apps/builder/src/app/integrations/whatsapp/webhook/[integrationId]/route.ts`)
 *    loads exactly one integration row by `integrationId` (the URL segment)
 *    and is never signature-verified when that integration has no app secret
 *    (`resolveSignaturePolicy` → `legacy-unverified`, see below) — any
 *    workspace can create such an integration and POST a forged payload
 *    naming another workspace's `phone_number_id`. That route must attach
 *    the loaded integration's own phone number id here as
 *    `config.phoneNumberId` (the `IntegrationWhatsapp.phoneNumberId` column)
 *    so this module can bind every parsed change to it.
 *  - The SHARED platform-credential route
 *    (`apps/builder/src/app/integrations/[...integration]/webhook.ts`)
 *    legitimately multiplexes every phone number registered under one
 *    platform credential through a single endpoint, and IS always HMAC
 *    verified. It never sets `config.phoneNumberId` — many numbers flowing
 *    through is the correct, expected shape there, so binding is a no-op.
 */
const resolvePinnedPhoneNumberId = (
  config: WhatsappConfig,
): string | undefined => {
  const pinned = config.phoneNumberId
  return typeof pinned === "string" && pinned.length > 0 ? pinned : undefined
}

/**
 * Drops every item whose `phoneNumberId` does not match the pinned one
 * (manual integration only — see {@link resolvePinnedPhoneNumberId}). A
 * dropped item is logged (`warn`, structured) so a forged/misrouted webhook
 * stays observable instead of silently vanishing. A no-op (returns `items`
 * unchanged) when nothing is pinned — the shared platform route's normal,
 * multi-number traffic.
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
 * One `messages`-field change's `value`, narrowed just enough to split it
 * into single-item sub-values. `whatsapp-api-js@6.2.1`'s `post()` only ever
 * reads `entry[0].changes[0].messages[0]` (confirmed against its source —
 * see `lib/raw-identity.ts`'s comment) — so a batched delivery carrying
 * several `messages[]`/`statuses[]` items, or several `messages`-field
 * changes, silently loses every item but the first unless each one is fed to
 * the SDK middleware as its OWN single-item POST.
 */
type MessagesChangeValue = {
  messages?: unknown[]
  statuses?: unknown[]
  contacts?: unknown[]
  metadata?: { phone_number_id?: unknown }
  [key: string]: unknown
}

/**
 * Splits a `messages`-field change's value into one value per
 * `messages[]`/`statuses[]` item, each carrying the index-aligned `contacts[]`
 * entry when one exists (Meta index-aligns `contacts[]` with `messages[]`
 * when a change legitimately batches several). A value with neither array
 * (some other `messages`-field shape) is returned unchanged, exactly as
 * before this split existed.
 */
const readStringField = (value: unknown, key: string): string | undefined => {
  const field =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)[key]
      : undefined
  return typeof field === "string" && field.length > 0 ? field : undefined
}

/**
 * The `contacts[]` entry belonging to ONE message of a batched `messages`
 * change. Matched by identity (`wa_id` vs the message's `from`, `user_id` vs
 * its `from_user_id`) rather than by position: Meta does not guarantee an
 * index-aligned `contacts[]`, and the SDK prefers `contact.wa_id` over
 * `message.from`, so a positional guess can attribute a message to the WRONG
 * customer. When nothing matches, the contact is omitted (leaving
 * `message.from` authoritative) — except for the ordinary single-contact
 * change whose message carries no identity of its own, where that one contact
 * IS the sender. Index is only a last-resort tiebreak for an equal-length
 * batch of otherwise unidentifiable messages.
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
 * Reconstructs one full webhook JSON body per `messages`-field change item
 * (see {@link splitMessagesChangeValue}), each shaped exactly like the
 * original POST but carrying only that single item — this is what gets fed
 * to the SDK middleware, once per item, instead of the whole batch once. A
 * `calls`-field change is never included here (handled entirely by
 * `extractCallEventPayloads` — see the comment on the `calls`-skip below).
 * A change whose `metadata.phone_number_id` does not match a pinned
 * integration (manual webhook route only) is dropped here, before the SDK
 * middleware — never reaches the SDK-derived `phoneID`, so the pinning gate on
 * the SDK message/status result is enforced at the source.
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
 * Parses the already-signature-verified raw body into the payload shapes the
 * rest of the handler enqueues. Never throws — an unparseable body just
 * yields empty payload lists so the webhook can still ACK Meta.
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
 * Reads the raw request bytes exactly once and, per `resolveSignaturePolicy`
 * (see `lib/signature-policy.ts`), either verifies the Meta
 * `X-Hub-Signature-256` header against them with the app secret BEFORE any
 * parsing, logging, or enqueueing happens (`"enforce"`), or accepts the
 * request unverified — exactly as before this HMAC fix existed — for a
 * manual integration with no app secret configured (`"legacy-unverified"`),
 * logging once so the gap stays visible.
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
 * Verified against `whatsapp-api-js@6.2.1`'s `post()` source
 * (`node_modules/.pnpm/whatsapp-api-js@6.2.1/.../lib/index.js`): it invokes
 * `this.on?.message?.call(null, args)` / `this.on?.status?.call(...)`
 * synchronously inside `post()`, itself called from `handle_post()` before
 * that method's own promise resolves — and only for
 * `entry[0].changes[0]`'s `messages[0]`/`statuses[0]`. So installing the
 * callbacks BEFORE calling `handle_post`, then awaiting `handle_post` to
 * completion, guarantees any callback it is going to fire — however long
 * that takes — has already run by the time `captured` is read below. No
 * timer, no race, and nothing can be silently dropped.
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
 * Gives each coexist job a deterministic jobId so a whole-webhook redelivery
 * (enqueue failures propagate as non-2xx, which makes Meta redeliver the
 * entire batch) is a no-op re-add instead of a duplicate
 * `coexistWhatsappBuffer` job. Hashed with Web Crypto (`sha256Hex`, itself
 * backed by `crypto.subtle`) rather than `node:crypto` so this module stays
 * edge-safe.
 *
 * A failure here PROPAGATES (as it did before the calling work): coexist
 * carries history/echo/state-sync payloads that only ever arrive once, so
 * swallowing a Redis outage would lose them permanently — Meta must be told
 * to redeliver. This runs after the call/message enqueues, all of which are
 * jobId-deduped, so a redelivery re-adds nothing that already landed.
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
 * Terminate jobs are delayed slightly so interim status jobs (often enqueued
 * in the same batch, and possibly from a concurrent webhook delivery) commit
 * first — the terminate handler labels a FAILED call "declined" only when it
 * can see a prior REJECTED status. The worker additionally lets a late
 * REJECTED upgrade a finalized `failed` row, so this delay is a fast path,
 * not the only defense.
 */
const TERMINATE_JOB_DELAY_MS = 2000

/**
 * Call jobs ride out transient DB/shard outages longer than the queue default
 * (2 attempts / 5s): the webhook has already ACKed Meta, so a dropped job
 * loses the call. Failed jobs are also aged out so their deterministic jobId
 * stops suppressing a later Meta redelivery of the same event forever.
 */
const CALL_EVENT_JOB_RETRY_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnFail: { age: 6 * 60 * 60 },
} as const

/**
 * The generic `whatsappCallEvent` job (consumed on the shared, unprioritized
 * `integration` queue) must NEVER carry the SDP offer (see
 * docs/whatsapp-calling-voip.md): a VoIP-mode connect's
 * `session` is peeled off into short-TTL Redis + the dedicated
 * `whatsappVoipSignaling` queue by {@link enqueueVoipConnectSignaling}
 * instead. `IntegrationJobWhatsappCallEvent`'s connect variant has no
 * `session` field, but `payload` here is a plain variable (not an object
 * literal), so TypeScript's excess-property check does not strip it at
 * compile time — this rebuilds the event explicitly so the field is
 * actually absent from the serialized job at runtime.
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
 * Enqueue failures here are NO LONGER swallowed — they propagate so the
 * webhook handler throws and the route answers non-2xx, so Meta redelivers.
 * Deterministic jobIds (already in place below) make that redelivery
 * duplicate-safe: a job that already committed is a no-op re-add, and a job
 * that never committed is retried for real instead of being silently lost on
 * a Redis blip.
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
          // Deduplicates Meta webhook redeliveries: one job per call id per
          // lifecycle step (connect / status-RINGING / … / terminate).
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
 * VoIP-mode connect branch (contracts #2/#3): additive alongside
 * {@link enqueueCallEventPayloads} — never a replacement for it, so the
 * ringing `WhatsappCall` row + incoming-call trigger the generic path
 * creates keeps firing for every connect, session-less or VoIP. Only a
 * validated `session` (a bounded SDP offer parsed by
 * `extractCallEventPayloads`) triggers this branch; a business-initiated or
 * session-less connect (what Meta sends when a number is configured for
 * Meta's SIP signalling, which ChatbotX does not use) is a no-op here. A
 * capture failure now PROPAGATES (no longer swallowed) so the
 * webhook handler throws and Meta redelivers — the underlying service calls
 * are idempotent (keyed by wacid/attemptId), so a redelivered capture is
 * safe to retry.
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
      // A business-initiated connect carries the USER's answer to our own
      // outbound offer — it must NEVER enter the inbound path below
      // (captureConnectOffer / rejectUnprocessableConnect / ring-all), which
      // has no leg for it and would otherwise Meta-reject our own dial.
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
    try {
      if (event.session) {
        await whatsappVoipSignalingService.captureConnectOffer({
          wacid: event.wacid,
          sdp: event.session.sdp,
          phoneNumberId: payload.phoneNumberId,
        })
      } else if (event.sessionInvalid) {
        // A VoIP connect whose SDP we cannot honor — reject it on Meta rather
        // than leaving it to ring out on the session-less path (ChatbotX has
        // no leg for it).
        await whatsappVoipSignalingService.rejectUnprocessableConnect({
          wacid: event.wacid,
          phoneNumberId: payload.phoneNumberId,
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
 * Meta-native call recording/transcript delivery (VoIP-only — see
 * `docs/whatsapp-calling-voip.md`): additive alongside
 * {@link enqueueCallEventPayloads}, never a replacement for it —
 * the generic `whatsappCallEvent` job still fires for these two event kinds
 * (today it only skip-logs them; the worker-side handling of that lands in a
 * later wave). A capture failure PROPAGATES (never swallowed) so
 * the webhook handler throws and Meta redelivers, mirroring
 * {@link enqueueVoipConnectSignaling}.
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
 * Every deterministic-jobId webhook job carries this: BullMQ keeps a FAILED
 * job under its id (the worker default retains 5000), and a retained failed
 * id silently swallows the very redelivery that is supposed to reprocess the
 * event. Removing the job the moment it fails keeps the id free for Meta's
 * next delivery, while COMPLETED jobs stay retained and keep deduping genuine
 * duplicates. (The call-event jobs age theirs out instead — see
 * `CALL_EVENT_JOB_RETRY_OPTIONS`.)
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
        // Deterministic jobId so a Meta redelivery of the same message
        // (now possible: enqueue failures upstream propagate to a non-2xx
        // instead of being swallowed) is a no-op re-add rather than a
        // duplicate job — the message row itself also dedupes by sourceId.
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
    // Read the body once as raw bytes — HTTP body is a one-shot stream.
    // Using arrayBuffer preserves the exact bytes for HMAC verification;
    // text would silently re-encode, risking a signature mismatch on
    // non-ASCII payloads. Verification happens BEFORE any parsing, logging,
    // or enqueueing so a forged request never reaches the queue.
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

      // The SDK middleware (`handle_post`) exists only to extract
      // message/status args for us. It is fed ONE reconstructed single-item
      // body per `messages`-field change item (see
      // `buildMessagesChangeBuffers`/`splitMessagesChangeValue`) instead of
      // the whole POST once — whatsapp-api-js@6.2.1's `post()` only ever
      // reads `entry[0].changes[0].messages[0]`, so a batched delivery (or a
      // mixed `calls`+`messages` delivery) used to silently lose every
      // message/status but the first. `messagesChangeBuffers` never contains
      // a `calls`-field change (built only from `field === "messages"`), so
      // this is also how a `calls` webhook (both inbound and outbound) never
      // reaches the middleware — sidestepping whatsapp-api-js@6.2.1's crash
      // on a `calls` contact with no `profile` (`contact?.profile.name`,
      // optional-chained on `contact` but NOT on `.profile`).
      const results: Array<
        | { type: "message"; data: OnMessageArgs }
        | { type: "status"; data: OnStatusArgs }
        | null
      > = []
      // Per-item try/catch: `capturePostResult` only PARSES (it never
      // enqueues), so a throw/non-200 here is deterministic for that one item
      // — e.g. whatsapp-api-js@6.2.1 crashing on `contact?.profile.name` when
      // a contact carries no `profile`. Letting it escape would fail the whole
      // delivery, drop its healthy sibling items, and trap Meta in an endless
      // redelivery of a body that can never succeed.
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

      // Order: the enqueues whose failure propagates (non-2xx so Meta
      // redelivers; every one of them is keyed by a deterministic jobId, so
      // a redelivery is a no-op re-add) run first. Coexist and automatic
      // events log-and-skip per item, so they run last and can never block
      // call or message delivery.
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
      // Surface the underlying cause: a bare `catch {}` here previously
      // discarded it, so a real failure (e.g. the SDK `handle_post`
      // middleware throwing on an unexpected payload shape) reached the
      // caller as an opaque "Failed to handle webhook" with no diagnosis.
      logger.error({ err }, "Whatsapp webhook handler failed")
      throw new SdkException("Failed to handle webhook")
    }
  }

  throw SdkException.methodNotImplemented
}
