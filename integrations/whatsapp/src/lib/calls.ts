import { z } from "zod"
import { logger } from "./logger"

/**
 * Parses Meta's `calls` webhook field (WhatsApp Business Calling API). `value`
 * carries either `calls[]` (connect/terminate events) or `statuses[]` (interim
 * status updates).
 */

const callDirectionSchema = z.enum(["USER_INITIATED", "BUSINESS_INITIATED"])

// VoIP-mode connect events carry an SDP offer inline, bounded so a malformed
// payload can't blow up memory/logs. Kept in memory only — must never reach
// logs or a persisted/queued path.
const MAX_SDP_OFFER_CHARS = 100_000

// Outbound calling inverts direction: the business POSTs an offer and Meta
// later echoes the user's answer on a `connect` event with
// `direction:"BUSINESS_INITIATED"`. Both shapes are structurally identical;
// expected `sdp_type` is enforced by `parseCallSession`'s `expectedSdpType`
// param.
const callSessionSchema = z.discriminatedUnion("sdp_type", [
  z.object({
    sdp_type: z.literal("offer"),
    sdp: z.string().min(1).max(MAX_SDP_OFFER_CHARS),
  }),
  z.object({
    sdp_type: z.literal("answer"),
    sdp: z.string().min(1).max(MAX_SDP_OFFER_CHARS),
  }),
])

// Bounded mirror of Meta's terminate-event error objects (media-drop codes
// 138021/138022/138023) — keeps an unbounded array from blowing up memory/logs
// on the hot webhook path.
const MAX_TERMINATE_ERRORS = 20

const callTerminateErrorSchema = z.object({
  code: z.number().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
})

// `wa_id` is optional — a Username/BSUID-only caller (no phone number exposed)
// never carries it; requiring it would fail the whole `calls` value and
// silently drop every item in the webhook.
const callContactSchema = z.object({
  wa_id: z.string().optional(),
  user_id: z.string().optional(),
  parent_user_id: z.string().optional(),
  profile: z
    .object({ name: z.string().optional(), username: z.string().optional() })
    .optional(),
})

// call_recording_available / call_transcription_available nesting: recording
// media sits under `call_recording.audio`; the transcript document sits under
// `call_transcript.document`. Both carry ids/urls only, never bytes.
const callRecordingMediaSchema = z.object({
  id: z.string(),
  sha256: z.string().optional(),
  mime_type: z.string().optional(),
  url: z.string().optional(),
})

const callRecordingSchema = z.object({
  type: z.string().optional(),
  audio: callRecordingMediaSchema,
})

const callTranscriptDocumentSchema = z.object({
  id: z.string(),
  sha256: z.string().optional(),
  mime_type: z.string().optional(),
  url: z.string().optional(),
})

const callTranscriptSchema = z.object({
  document: callTranscriptDocumentSchema,
})

const callEventItemSchema = z.object({
  id: z.string(),
  event: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  // Item-level BSUID fields — present when either leg of the call is a
  // Username/BSUID-only user (no phone number exposed on that leg).
  from_user_id: z.string().optional(),
  to_user_id: z.string().optional(),
  from_parent_user_id: z.string().optional(),
  to_parent_user_id: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  direction: callDirectionSchema.optional(),
  status: z.string().optional(),
  start_time: z.union([z.string(), z.number()]).optional(),
  end_time: z.union([z.string(), z.number()]).optional(),
  duration: z.union([z.string(), z.number()]).optional(),
  biz_opaque_callback_data: z.string().optional(),
  // Validated separately so a malformed/oversized session never fails the whole
  // item. Absent means a session-less connect (Meta's SIP signalling, unused by
  // ChatbotX). Present but invalid means a VoIP connect that must be Meta-
  // rejected rather than dropped into the session-less path.
  session: z.unknown().optional(),
  // Present on `terminate` items when media dropped mid-call, so the handler
  // can label the failure precisely instead of a bare FAILED status.
  errors: z
    .array(callTerminateErrorSchema)
    .max(MAX_TERMINATE_ERRORS)
    .optional(),
  // Present only on `call_recording_available` / `call_transcription_available`.
  call_recording: callRecordingSchema.optional(),
  call_transcript: callTranscriptSchema.optional(),
})

const callStatusItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  type: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  recipient_id: z.string().optional(),
  // The BSUID a status targets when the recipient has no phone number exposed
  // (`recipient_id` is empty then) — mirrors `statuses[].recipient_user_id` on
  // the `messages` webhook.
  recipient_user_id: z.string().optional(),
  biz_opaque_callback_data: z.string().optional(),
})

const callsValueSchema = z.object({
  metadata: z.object({
    phone_number_id: z.string(),
    display_phone_number: z.string().optional(),
  }),
  contacts: z.array(callContactSchema).optional(),
  calls: z.array(callEventItemSchema).optional(),
  statuses: z.array(callStatusItemSchema).optional(),
  // Meta documents the terminate `errors[]` at the value level, sibling of
  // `calls`, not inside the call item. The item-level `errors` is also accepted
  // since live payloads carry it there too. Missing either meant a media-drop
  // failure reached the terminate handler with no diagnosis.
  errors: z
    .array(callTerminateErrorSchema)
    .max(MAX_TERMINATE_ERRORS)
    .optional(),
})

export type WhatsappCallDirectionPayload = "userInitiated" | "businessInitiated"

/**
 * A validated, bounded SDP session from a VoIP-mode connect event. `offer` on
 * inbound (USER_INITIATED); `answer` on outbound (BUSINESS_INITIATED).
 */
export type WhatsappCallSessionPayload = {
  sdpType: "offer" | "answer"
  sdp: string
}

/** Minimal, bounded terminate-event error (media-drop diagnosis). */
export type WhatsappCallTerminateError = {
  code?: number
  title?: string
  message?: string
}

export type WhatsappCallContactPayload = {
  /** Absent for a Username/BSUID-only caller (no phone number exposed). */
  waId?: string
  userId?: string
  parentUserId?: string
  username?: string
  name?: string
}

/** Normalized recording media reference (ids/urls only — never bytes). */
export type WhatsappCallRecordingAudioPayload = {
  mediaId: string
  sha256?: string
  mimeType?: string
  url?: string
}

/** Normalized transcript document reference (ids/urls only — never bytes). */
export type WhatsappCallTranscriptDocumentPayload = {
  mediaId: string
  sha256?: string
  mimeType?: string
  url?: string
}

/** Normalized single call event, ready to enqueue as one integration job. */
export type WhatsappCallEventPayload = {
  phoneNumberId: string
  contact?: WhatsappCallContactPayload
  event:
    | {
        kind: "connect"
        wacid: string
        direction: WhatsappCallDirectionPayload
        from?: string
        to?: string
        /** BSUID counterparts of `from`/`to` (Username/BSUID-only legs). */
        fromUserId?: string
        toUserId?: string
        fromParentUserId?: string
        toParentUserId?: string
        timestamp?: string
        /** Present only for a validated VoIP-mode (SDP offer) connect. */
        session?: WhatsappCallSessionPayload
        /**
         * A `session` was present but malformed/oversized — a VoIP connect that
         * must be Meta-rejected, not dropped into the session-less path.
         * Mutually exclusive with `session`.
         */
        sessionInvalid?: boolean
        /**
         * Meta echoes the outbound `connect` action's idempotency key
         * (`attemptId`) — the only correlation available before `wacid` is
         * known. Absent on session-less/legacy connects.
         */
        bizOpaqueCallbackData?: string
      }
    | {
        kind: "terminate"
        wacid: string
        direction?: WhatsappCallDirectionPayload
        status: "COMPLETED" | "FAILED"
        from?: string
        to?: string
        /** BSUID counterparts of `from`/`to` (Username/BSUID-only legs). */
        fromUserId?: string
        toUserId?: string
        fromParentUserId?: string
        toParentUserId?: string
        timestamp?: string
        startTime?: string
        endTime?: string
        durationSeconds?: number
        /** Media-drop diagnosis (e.g. 138021/138022/138023). */
        errors?: WhatsappCallTerminateError[]
      }
    | {
        kind: "status"
        wacid: string
        status: "RINGING" | "ACCEPTED" | "REJECTED"
        recipientId?: string
        /** BSUID counterpart of `recipientId` (Username/BSUID-only recipient). */
        recipientUserId?: string
        timestamp?: string
        /** Meta's `biz_opaque_callback_data` echo (see the `connect` variant). */
        bizOpaqueCallbackData?: string
      }
    | {
        kind: "recordingAvailable"
        wacid: string
        audio: WhatsappCallRecordingAudioPayload
        direction?: WhatsappCallDirectionPayload
        /** Meta's `biz_opaque_callback_data` echo, when present. */
        bizOpaqueCallbackData?: string
      }
    | {
        kind: "transcriptionAvailable"
        wacid: string
        document: WhatsappCallTranscriptDocumentPayload
      }
}

const toDirection = (
  raw: z.infer<typeof callDirectionSchema> | undefined,
): WhatsappCallDirectionPayload | undefined => {
  if (raw === "USER_INITIATED") {
    return "userInitiated"
  }
  if (raw === "BUSINESS_INITIATED") {
    return "businessInitiated"
  }
  return
}

const toOptionalString = (
  value: string | number | undefined,
): string | undefined => (value === undefined ? undefined : String(value))

const toContactPayload = (
  contacts: z.infer<typeof callContactSchema>[] | undefined,
): WhatsappCallContactPayload | undefined => {
  const contact = contacts?.[0]
  if (!contact) {
    return
  }
  return {
    waId: contact.wa_id,
    userId: contact.user_id,
    parentUserId: contact.parent_user_id,
    username: contact.profile?.username,
    name: contact.profile?.name,
  }
}

/**
 * The identity to match a `contacts[]` entry against for one
 * `calls[]`/`statuses[]` item. Which fields to pass varies by shape:
 * `statuses[]` supplies `recipient_id`/`recipient_user_id`; `calls[]` supplies
 * `from`/`from_user_id` (USER_INITIATED) or `to`/`to_user_id`
 * (BUSINESS_INITIATED).
 */
type CallItemIdentity = { from?: string; fromUserId?: string }

/**
 * The `contacts[]` entry for one `calls[]`/`statuses[]` item, matched by
 * identity rather than position (an index-aligned `contacts[]` isn't
 * guaranteed). When nothing matches, the item's own `from`/`to` fields stay
 * authoritative — except items with no identity of their own (e.g.
 * recording/transcript-available), where the one contact IS the party.
 */
const pickContactForCallItem = (
  contacts: z.infer<typeof callContactSchema>[] | undefined,
  identity: CallItemIdentity,
): WhatsappCallContactPayload | undefined => {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return
  }
  const { from, fromUserId } = identity
  const matched = contacts.find(
    (contact) =>
      (from !== undefined && contact.wa_id === from) ||
      (fromUserId !== undefined && contact.user_id === fromUserId),
  )
  if (matched) {
    return toContactPayload([matched])
  }
  if (from === undefined && fromUserId === undefined) {
    return contacts.length === 1 ? toContactPayload(contacts) : undefined
  }
  return
}

const readWebhookEntries = (rawBody: unknown): unknown[] => {
  if (typeof rawBody !== "object" || rawBody === null) {
    return []
  }
  const entries = (rawBody as { entry?: unknown }).entry
  return Array.isArray(entries) ? entries : []
}

/**
 * Result of validating a connect event's raw `session` field: `undefined` = no
 * session (SIP signalling, unused by ChatbotX); `"invalid"` = present but
 * malformed/oversized, must be Meta-rejected; otherwise a validated, bounded
 * SDP offer.
 */
type ParsedCallSession = WhatsappCallSessionPayload | "invalid" | undefined

/**
 * Which `sdp_type` a connect event's session must carry: USER_INITIATED
 * (inbound) carries the caller's OFFER; BUSINESS_INITIATED (outbound) carries
 * the user's ANSWER. A mismatched `sdp_type` is treated as invalid.
 */
const expectedSdpTypeForDirection = (
  direction: WhatsappCallDirectionPayload,
): "offer" | "answer" =>
  direction === "businessInitiated" ? "answer" : "offer"

/**
 * Validates a connect event's raw `session` field. Length is checked before the
 * zod parse so an oversized string never pays for schema validation on the hot
 * webhook path. Malformed/oversized/mismatched returns `"invalid"` (never
 * thrown); absent returns `undefined`.
 */
const parseCallSession = (
  wacid: string,
  rawSession: unknown,
  expectedSdpType: "offer" | "answer",
): ParsedCallSession => {
  if (rawSession === undefined) {
    return
  }
  if (
    typeof rawSession === "object" &&
    rawSession !== null &&
    typeof (rawSession as { sdp?: unknown }).sdp === "string" &&
    (rawSession as { sdp: string }).sdp.length > MAX_SDP_OFFER_CHARS
  ) {
    logger.warn(
      { wacid, sdpLength: (rawSession as { sdp: string }).sdp.length },
      "Whatsapp call session invalid: SDP offer exceeds size limit",
    )
    return "invalid"
  }

  const parsed = callSessionSchema.safeParse(rawSession)
  if (!parsed.success) {
    logger.warn(
      { wacid, issues: parsed.error.issues },
      "Whatsapp call session invalid: malformed session",
    )
    return "invalid"
  }

  if (parsed.data.sdp_type !== expectedSdpType) {
    logger.warn(
      { wacid, sdpType: parsed.data.sdp_type, expectedSdpType },
      "Whatsapp call session invalid: malformed session",
    )
    return "invalid"
  }

  return { sdpType: parsed.data.sdp_type, sdp: parsed.data.sdp }
}

/**
 * Normalizes a terminate item's `status` case-insensitively since nothing on
 * the wire guarantees consistent casing. An unrecognized status is logged and
 * defaults to `FAILED`.
 */
const normalizeTerminateStatus = (
  wacid: string,
  rawStatus: string | undefined,
): "COMPLETED" | "FAILED" => {
  const upper = (rawStatus ?? "").toUpperCase()
  if (upper === "COMPLETED") {
    return "COMPLETED"
  }
  if (upper !== "FAILED") {
    logger.warn(
      { wacid, status: rawStatus },
      "Whatsapp call terminate status unknown; defaulting to FAILED",
    )
  }
  return "FAILED"
}

const normalizeCallItem = (
  item: z.infer<typeof callEventItemSchema>,
): WhatsappCallEventPayload["event"] | undefined => {
  if (item.event === "connect" || item.event === "call_created") {
    const direction = toDirection(item.direction)
    if (!direction) {
      logger.warn(
        { wacid: item.id, direction: item.direction },
        "Whatsapp call connect skipped: missing direction",
      )
      return
    }
    const session = parseCallSession(
      item.id,
      item.session,
      expectedSdpTypeForDirection(direction),
    )
    return {
      kind: "connect",
      wacid: item.id,
      direction,
      from: item.from,
      to: item.to,
      fromUserId: item.from_user_id,
      toUserId: item.to_user_id,
      fromParentUserId: item.from_parent_user_id,
      toParentUserId: item.to_parent_user_id,
      timestamp: toOptionalString(item.timestamp),
      session: session === "invalid" ? undefined : session,
      sessionInvalid: session === "invalid",
      bizOpaqueCallbackData: item.biz_opaque_callback_data,
    }
  }

  if (item.event === "terminate") {
    const status = normalizeTerminateStatus(item.id, item.status)
    const duration = Number(item.duration)
    return {
      kind: "terminate",
      wacid: item.id,
      direction: toDirection(item.direction),
      status,
      from: item.from,
      to: item.to,
      fromUserId: item.from_user_id,
      toUserId: item.to_user_id,
      fromParentUserId: item.from_parent_user_id,
      toParentUserId: item.to_parent_user_id,
      timestamp: toOptionalString(item.timestamp),
      startTime: toOptionalString(item.start_time),
      endTime: toOptionalString(item.end_time),
      durationSeconds: Number.isFinite(duration) ? duration : undefined,
      errors: item.errors,
    }
  }

  if (item.event === "call_recording_available") {
    if (!item.call_recording) {
      logger.warn(
        { wacid: item.id, event: item.event },
        "Whatsapp call recording-available skipped: missing call_recording",
      )
      return
    }
    return {
      kind: "recordingAvailable",
      wacid: item.id,
      audio: {
        mediaId: item.call_recording.audio.id,
        sha256: item.call_recording.audio.sha256,
        mimeType: item.call_recording.audio.mime_type,
        url: item.call_recording.audio.url,
      },
      direction: toDirection(item.direction),
      bizOpaqueCallbackData: item.biz_opaque_callback_data,
    }
  }

  // Meta's live webhook uses `call_transcript_available`; some docs/versions
  // spell it `call_transcription_available`. Accept both so the transcript is
  // never dropped as an "unknown event".
  if (
    item.event === "call_transcript_available" ||
    item.event === "call_transcription_available"
  ) {
    if (!item.call_transcript) {
      logger.warn(
        { wacid: item.id, event: item.event },
        "Whatsapp call transcription-available skipped: missing call_transcript",
      )
      return
    }
    return {
      kind: "transcriptionAvailable",
      wacid: item.id,
      document: {
        mediaId: item.call_transcript.document.id,
        sha256: item.call_transcript.document.sha256,
        mimeType: item.call_transcript.document.mime_type,
        url: item.call_transcript.document.url,
      },
    }
  }

  logger.warn(
    { wacid: item.id, event: item.event },
    "Whatsapp call event skipped: unknown event",
  )
  return
}

const normalizeStatusItem = (
  item: z.infer<typeof callStatusItemSchema>,
): WhatsappCallEventPayload["event"] | undefined => {
  if (
    item.status !== "RINGING" &&
    item.status !== "ACCEPTED" &&
    item.status !== "REJECTED"
  ) {
    logger.warn(
      { wacid: item.id, status: item.status },
      "Whatsapp call status skipped: unknown status",
    )
    return
  }
  return {
    kind: "status",
    wacid: item.id,
    status: item.status,
    recipientId: item.recipient_id,
    recipientUserId: item.recipient_user_id,
    timestamp: toOptionalString(item.timestamp),
    bizOpaqueCallbackData: item.biz_opaque_callback_data,
  }
}

/**
 * Extracts every call event from a raw webhook body. Malformed entries are
 * logged and skipped so one bad item never blocks the rest of the batch.
 */
export const extractCallEventPayloads = (
  rawBody: unknown,
): WhatsappCallEventPayload[] => {
  const payloads: WhatsappCallEventPayload[] = []

  for (const entry of readWebhookEntries(rawBody)) {
    const changes =
      typeof entry === "object" && entry !== null
        ? (entry as { changes?: unknown }).changes
        : undefined
    if (!Array.isArray(changes)) {
      continue
    }

    for (const change of changes) {
      if (
        typeof change !== "object" ||
        change === null ||
        (change as { field?: unknown }).field !== "calls"
      ) {
        continue
      }

      const parsed = callsValueSchema.safeParse(
        (change as { value?: unknown }).value,
      )
      if (!parsed.success) {
        logger.warn(
          { issues: parsed.error.issues },
          "Whatsapp call webhook skipped: malformed value",
        )
        continue
      }

      const { metadata, contacts, calls, statuses, errors } = parsed.data

      // The value-level `errors[]` describes one call's failure but sits
      // outside the `calls` array, so it can only be attributed when the batch
      // holds a single terminate — with two, guessing by position would repeat
      // the mistake `pickContactForCallItem` avoids, so it's dropped instead.
      // An item's own `errors` always wins.
      const terminateItemCount = (calls ?? []).filter(
        (item) => item.event === "terminate",
      ).length
      const sharedTerminateErrors =
        terminateItemCount === 1 ? errors : undefined

      // Interim statuses are pushed before call events: when a batch carries
      // both a REJECTED status and its terminate, the terminate handler needs
      // to see the rejection to label the call "declined" rather than "missed".
      for (const item of statuses ?? []) {
        const event = normalizeStatusItem(item)
        if (event) {
          payloads.push({
            phoneNumberId: metadata.phone_number_id,
            contact: pickContactForCallItem(contacts, {
              from: item.recipient_id,
              fromUserId: item.recipient_user_id,
            }),
            event,
          })
        }
      }

      for (const item of calls ?? []) {
        const event = normalizeCallItem(item)
        if (event) {
          // BUSINESS_INITIATED matches the callee (`to`/`to_user_id`); every
          // other item (USER_INITIATED, or an event with no direction, e.g.
          // a recording/transcript-available item) matches the caller
          // (`from`/`from_user_id`).
          const identity: CallItemIdentity =
            item.direction === "BUSINESS_INITIATED"
              ? { from: item.to, fromUserId: item.to_user_id }
              : { from: item.from, fromUserId: item.from_user_id }
          payloads.push({
            phoneNumberId: metadata.phone_number_id,
            contact: pickContactForCallItem(contacts, identity),
            event:
              event.kind === "terminate" && !event.errors
                ? { ...event, errors: sharedTerminateErrors }
                : event,
          })
        }
      }
    }
  }

  return payloads
}
