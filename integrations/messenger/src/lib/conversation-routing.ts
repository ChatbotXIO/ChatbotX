import { toThreadControlTimestamp } from "@chatbotx.io/database/partials"
import type {
  IncomingContact,
  ThreadControlAppRolesEvent,
  ThreadControlRequestEvent,
  ThreadControlWebhookEvent,
  ThreadControlWebhookResult,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import {
  messengerAppRolesEventSchema,
  messengerStandbyEventSchema,
} from "../schema"
import { logger } from "./logger"
import { readBusinessAiAppId } from "./thread-control-config"

/**
 * Conversation Routing (Handover Protocol) webhook parsing. Parsers are pure,
 * never throw and return `null` for anything malformed, so one bad item can
 * never fail the webhook. Messenger timestamps are MILLISECONDS; every
 * `occurredAt` is floored to whole seconds (`toThreadControlTimestamp`) so the
 * same-second precedence tie-break in the thread-control model is not bypassed.
 */

// ---------------------------------------------------------------------------
// Job contract
// ---------------------------------------------------------------------------

/** BullMQ job name for every routing item (same as the other channels). */
export const THREAD_CONTROL_EVENT_JOB_NAME = "threadControlEvent"

export const threadControlPayloadKinds = [
  "handover",
  "handoverRequest",
  "appRoles",
  "standbyMessage",
] as const
export type ThreadControlPayloadKind =
  (typeof threadControlPayloadKinds)[number]

/** The job payload the webhook extractor enqueues and the handler consumes. */
export type ThreadControlJobPayload = {
  kind: ThreadControlPayloadKind
  body: unknown
}

/**
 * Distinct job-id prefixes: a standby job can never swallow an owner delivery
 * (`incomingMessage`) of the same `mid`.
 */
export const THREAD_CONTROL_JOB_ID_PREFIX: Record<
  ThreadControlPayloadKind,
  string
> = {
  handover: "fb-tc",
  handoverRequest: "fb-tcr",
  appRoles: "fb-ar",
  standbyMessage: "fb-sb",
}

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A Meta millisecond timestamp as a whole-second Date; unusable -> the clock. */
export const messengerTimestampToOccurredAt = (
  value: unknown,
  now: Date = new Date(),
): Date => {
  const ms = typeof value === "string" ? Number(value) : value
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) {
    return toThreadControlTimestamp(now)
  }
  return toThreadControlTimestamp(new Date(ms))
}

const timestampSchema = z.union([z.number(), z.string()])

// `.catch(undefined)`: an unexpected shape of an optional field degrades to
// absent instead of failing the parse and dropping the ownership change.
const appIdSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .optional()
  .catch(undefined)

const optionalTextSchema = z.string().optional().catch(undefined)

/** Nested `thread_control_metadata.text` (per v1), else Meta's flat `metadata`. */
const handoverPayloadSchema = z.looseObject({
  new_owner_app_id: appIdSchema,
  previous_owner_app_id: appIdSchema,
  requested_owner_app_id: appIdSchema,
  metadata: optionalTextSchema,
  thread_control_metadata: z
    .looseObject({ text: optionalTextSchema })
    .optional()
    .catch(undefined),
})
type HandoverPayload = z.infer<typeof handoverPayloadSchema>

const readHandoverNote = (payload: HandoverPayload): string | undefined => {
  const note = payload.thread_control_metadata?.text ?? payload.metadata
  return note && note.trim().length > 0 ? note : undefined
}

const handoverItemSchema = z.looseObject({
  sender: z.looseObject({ id: z.string().min(1) }),
  recipient: z.looseObject({ id: z.string().optional() }).optional(),
  timestamp: timestampSchema.optional(),
  pass_thread_control: handoverPayloadSchema.optional(),
  take_thread_control: handoverPayloadSchema.optional(),
  request_thread_control: handoverPayloadSchema.optional(),
})

/**
 * An extra hand-back signal, alongside `pass_thread_control` (which is handled
 * as before). Observed in practice, not documented by Meta: when a customer
 * asks Meta's AI for a human, it sends this notice when it hands the chat back.
 * The notice is an ordinary-looking item whose `message` is only an
 * `admin_text` (a display line) with no `mid`, and no `pass_thread_control` of
 * its own. Meta delivers `messaging[]` items to the app that owns the thread,
 * so receiving it there means the thread is ours again. Detected by its shape,
 * plus the temporary text guard below.
 */

/**
 * TEMPORARY, while Meta's other admin notices are not known: the line must name
 * the AI. "AI" reads the same in the languages Meta localizes it to; it is
 * matched as a whole upper-case word, so Vietnamese "ai" (who) never matches.
 */
const AI_WORD = /\bAI\b/

export const isAiHandbackNotice = (item: unknown): boolean => {
  if (!(isRecord(item) && isRecord(item.message))) {
    return false
  }
  return (
    typeof item.message.admin_text === "string" &&
    AI_WORD.test(item.message.admin_text) &&
    item.message.mid === undefined &&
    !("pass_thread_control" in item) &&
    !("take_thread_control" in item)
  )
}

/** What structure a `messaging[]` item carries, if it is a routing item. */
export type MessagingRoutingKind = Extract<
  ThreadControlPayloadKind,
  "handover" | "handoverRequest" | "appRoles"
>

/**
 * Classifies a raw `messaging[]` item by its routing key. `null` = an ordinary
 * message/postback/read item that is not a routing structure.
 */
export const classifyMessagingRoutingItem = (
  item: unknown,
): MessagingRoutingKind | null => {
  if (!isRecord(item)) {
    return null
  }
  if ("pass_thread_control" in item || "take_thread_control" in item) {
    return "handover"
  }
  if ("request_thread_control" in item) {
    return "handoverRequest"
  }
  if ("app_roles" in item) {
    return "appRoles"
  }
  if (isAiHandbackNotice(item)) {
    return "handover"
  }
  return null
}

// ---------------------------------------------------------------------------
// pass / take
// ---------------------------------------------------------------------------

/**
 * A `pass_thread_control` / `take_thread_control` item as a handover event.
 * The owner is an app id (`newOwnerAppId` / `previousOwnerAppId`), never a
 * role. `null` when malformed or when it names no contact.
 */
export const parseHandoverEvent = (
  item: unknown,
  now: Date = new Date(),
  ownAppId: string | null = null,
): ThreadControlWebhookEvent | null => {
  const parsed = handoverItemSchema.safeParse(item)
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      "Messenger handover skipped: malformed payload",
    )
    return null
  }
  const { data } = parsed
  const isPassed = data.pass_thread_control !== undefined
  const payload = data.pass_thread_control ?? data.take_thread_control
  if (!payload) {
    if (isAiHandbackNotice(item)) {
      // The Business-AI agent handed the chat back to the app that receives
      // this item: a pass from it to us, with no pass/take payload to read.
      return {
        contact: { sourceId: data.sender.id },
        event: "controlPassed",
        previousOwnerRole: null,
        newOwnerRole: null,
        previousOwnerAppId: readBusinessAiAppId(),
        // A notice may arrive for a thread we already hold: only the AI's
        // thread can be handed back by it.
        onlyIfOwnedByAppId: readBusinessAiAppId(),
        ...(ownAppId ? { newOwnerAppId: ownAppId } : {}),
        occurredAt: messengerTimestampToOccurredAt(data.timestamp, now),
      }
    }
    logger.warn("Messenger handover skipped: no pass/take payload")
    return null
  }

  const handoverNote = readHandoverNote(payload)
  const contact: IncomingContact = { sourceId: data.sender.id }
  return {
    contact,
    event: isPassed ? "controlPassed" : "controlTaken",
    previousOwnerRole: null,
    newOwnerRole: null,
    ...(payload.previous_owner_app_id
      ? { previousOwnerAppId: payload.previous_owner_app_id }
      : {}),
    ...(payload.new_owner_app_id
      ? { newOwnerAppId: payload.new_owner_app_id }
      : {}),
    ...(handoverNote ? { handoverNote } : {}),
    occurredAt: messengerTimestampToOccurredAt(data.timestamp, now),
  }
}

// ---------------------------------------------------------------------------
// request_thread_control
// ---------------------------------------------------------------------------

/** A `request_thread_control` item. Parsed only; nothing acts on it in v1. */
export const parseRequestEvent = (
  item: unknown,
  now: Date = new Date(),
): ThreadControlRequestEvent | null => {
  const parsed = handoverItemSchema.safeParse(item)
  const payload = parsed.success ? parsed.data.request_thread_control : null
  if (!(parsed.success && payload)) {
    logger.warn("Messenger thread request skipped: malformed payload")
    return null
  }
  const handoverNote = readHandoverNote(payload)
  return {
    contact: { sourceId: parsed.data.sender.id },
    ...(payload.requested_owner_app_id
      ? { requestedOwnerAppId: payload.requested_owner_app_id }
      : {}),
    ...(handoverNote ? { handoverNote } : {}),
    occurredAt: messengerTimestampToOccurredAt(parsed.data.timestamp, now),
  }
}

// ---------------------------------------------------------------------------
// app_roles
// ---------------------------------------------------------------------------

/** An `app_roles` item (Page config; no contact `sender`). */
export const parseAppRolesEvent = (
  item: unknown,
  now: Date = new Date(),
): ThreadControlAppRolesEvent | null => {
  const parsed = messengerAppRolesEventSchema.safeParse(item)
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      "Messenger app_roles skipped: malformed payload",
    )
    return null
  }
  return {
    accountId: parsed.data.recipient.id,
    roles: parsed.data.app_roles,
    occurredAt: messengerTimestampToOccurredAt(parsed.data.timestamp, now),
  }
}

/**
 * The job body of a `handover` / `handoverRequest` / `appRoles` job as the
 * typed result the worker consumes. `null` for anything malformed.
 */
export const parseRoutingJobBody = (
  kind: Exclude<ThreadControlPayloadKind, "standbyMessage">,
  body: unknown,
  now: Date = new Date(),
  ownAppId: string | null = null,
): ThreadControlWebhookResult | null => {
  if (kind === "handover") {
    const event = parseHandoverEvent(body, now, ownAppId)
    return event ? { kind: "handover", event } : null
  }
  if (kind === "handoverRequest") {
    const event = parseRequestEvent(body, now)
    return event ? { kind: "handoverRequest", event } : null
  }
  const event = parseAppRolesEvent(body, now)
  return event ? { kind: "appRoles", event } : null
}

// ---------------------------------------------------------------------------
// standby
// ---------------------------------------------------------------------------

/** Routing info of one `standby[]` item (a non-owner delivery). */
export type StandbyDelivery = {
  contact: IncomingContact
  /** `message.mid` / `postback.mid` when present; reads/deliveries have none. */
  mid?: string
  /** Floored to whole seconds. */
  occurredAt: Date
  /** True for a message this account itself sent (`is_echo`). */
  isEcho: boolean
}

/**
 * A `standby[]` item. Tolerates a postback with its payload stripped. The
 * contact is the user: `recipient` for an echo, `sender` otherwise. `null`
 * when malformed.
 */
export const parseStandbyDelivery = (
  item: unknown,
  now: Date = new Date(),
): StandbyDelivery | null => {
  const parsed = messengerStandbyEventSchema.safeParse(item)
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      "Messenger standby item skipped: malformed payload",
    )
    return null
  }
  const { data } = parsed
  const isEcho = data.message?.is_echo === true
  const mid = data.message?.mid ?? data.postback?.mid
  return {
    contact: { sourceId: isEcho ? data.recipient.id : data.sender.id },
    ...(mid ? { mid } : {}),
    occurredAt: messengerTimestampToOccurredAt(data.timestamp, now),
    isEcho,
  }
}
