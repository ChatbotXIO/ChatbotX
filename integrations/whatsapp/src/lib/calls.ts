import { z } from "zod"
import { logger } from "./logger"

/**
 * Parsing for Meta's `calls` webhook field (WhatsApp Business Calling API).
 *
 * The field carries two shapes on `value`:
 *  - `calls[]`    — Call Connect (`event: "connect"`) and Call Terminate
 *                   (`event: "terminate"`) events
 *  - `statuses[]` — interim call status updates (RINGING/ACCEPTED/REJECTED)
 *
 * Reference:
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/reference
 */

const callDirectionSchema = z.enum(["USER_INITIATED", "BUSINESS_INITIATED"])

// VoIP-mode connect events carry an SDP offer inline (see
// docs/whatsapp-calling-voip.md, "Parser boundary"). The offer is bounded so
// a pathological payload cannot blow up memory/logs before we even decide
// whether to keep it. The parsed offer stays in memory only; it must never
// reach logs (see `packages/logger/src/redact.ts`) or a persisted/queued
// path.
const MAX_SDP_OFFER_CHARS = 100_000

// Outbound (business-initiated) calling inverts the inbound direction: the
// business POSTs an `sdp_type:"offer"` to Meta's connect action and Meta
// later echoes the user's `sdp_type:"answer"` on a `connect` webhook event
// carrying `direction:"BUSINESS_INITIATED"`. Both shapes are structurally
// identical ({ sdp_type, sdp }, SDP bounded by MAX_SDP_OFFER_CHARS) — which
// literal is expected for a given event is a direction concern, enforced by
// `parseCallSession`'s `expectedSdpType` param, not by this shape schema.
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

// Bounded, minimal mirror of Meta's terminate-event error objects (dropped-
// media codes 138021/138022/138023 land here) — enough for diagnosis without
// letting an unbounded array blow up memory/logs on the hot webhook path.
const MAX_TERMINATE_ERRORS = 20

const callTerminateErrorSchema = z.object({
  code: z.number().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
})

// R2: `wa_id` is OPTIONAL — a Username/BSUID-only caller (no phone number
// exposed) still carries `user_id`/`parent_user_id`/`profile.username` but
// never `wa_id`. Requiring `wa_id` here used to fail the WHOLE `calls` value
// (`callsValueSchema.safeParse`) for such a contact, silently dropping every
// call/status item in the same webhook — never just the one item.
const callContactSchema = z.object({
  wa_id: z.string().optional(),
  user_id: z.string().optional(),
  parent_user_id: z.string().optional(),
  profile: z
    .object({ name: z.string().optional(), username: z.string().optional() })
    .optional(),
})

// call_recording_available / call_transcription_available webhook nesting,
// verified against developers.facebook.com/documentation/business-messaging/
// whatsapp/calling/{call-recording,call-transcription} (2026-09-14): the
// recording media sits under `call_recording.audio`, sibling to
// `call_recording.type:"audio"`; the transcript document sits under
// `call_transcript.document`. Both objects carry ids/urls only — never bytes.
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
  // R2: item-level BSUID fields — present when either leg of the call is a
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
  // Validated separately (see `parseCallSession`) so a malformed/oversized
  // session never fails the whole item. A session that is ABSENT means a
  // session-less connect (what Meta sends when a number is configured for
  // Meta's SIP signalling, which ChatbotX does not use; falls through to the
  // existing behavior); a session that is PRESENT but invalid means a VoIP
  // connect we cannot honor — it is flagged (`sessionInvalid`) so the VoIP
  // branch Meta-rejects it rather than dropping it into the session-less
  // path, which has no leg for a VoIP call.
  session: z.unknown().optional(),
  // Present on `terminate` items when media dropped mid-call (e.g.
  // 138021/138022/138023) — surfaced so the terminate handler can label the
  // failure precisely instead of a bare FAILED status.
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
  // R2: the BSUID a status targets when the recipient has no phone number
  // exposed (`recipient_id` is empty in that case) — mirrors
  // `statuses[].recipient_user_id` on the `messages` webhook (see
  // `lib/raw-identity.ts`).
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
})

export type WhatsappCallDirectionPayload = "userInitiated" | "businessInitiated"

/**
 * A validated, bounded SDP session captured from a VoIP-mode connect event.
 * `"offer"` on a USER_INITIATED connect (inbound); `"answer"` on a
 * BUSINESS_INITIATED connect (outbound — the user's answer to our offer).
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
  /** R2: absent for a Username/BSUID-only caller (no phone number exposed). */
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
        /** R2: BSUID counterparts of `from`/`to` (Username/BSUID-only legs). */
        fromUserId?: string
        toUserId?: string
        fromParentUserId?: string
        toParentUserId?: string
        timestamp?: string
        /** Present only for a validated VoIP-mode (SDP offer) connect. */
        session?: WhatsappCallSessionPayload
        /**
         * A `session` was present but malformed/oversized: this is a VoIP
         * connect the app cannot answer, and it must be Meta-rejected rather
         * than dropped into the session-less path. Mutually exclusive with
         * `session`.
         */
        sessionInvalid?: boolean
        /**
         * Meta echoes the outbound `connect` action's idempotency key
         * (`attemptId`) on this field — the only correlation available
         * before `wacid` is known. Absent on session-less/legacy connects.
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
        /** R2: BSUID counterparts of `from`/`to` (Username/BSUID-only legs). */
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
        /** R2: BSUID counterpart of `recipientId` (Username/BSUID-only recipient). */
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

const readWebhookEntries = (rawBody: unknown): unknown[] => {
  if (typeof rawBody !== "object" || rawBody === null) {
    return []
  }
  const entries = (rawBody as { entry?: unknown }).entry
  return Array.isArray(entries) ? entries : []
}

/**
 * Result of validating a connect event's raw `session` field:
 * - `undefined` — no session at all (a session-less connect — what Meta
 *   sends when a number is configured for Meta's SIP signalling, which
 *   ChatbotX does not use; falls through).
 * - `"invalid"` — a session WAS present but malformed/oversized (a VoIP
 *   connect that must be Meta-rejected, never dropped into the session-less
 *   path).
 * - payload    — a validated, bounded SDP offer.
 */
type ParsedCallSession = WhatsappCallSessionPayload | "invalid" | undefined

/**
 * Which `sdp_type` a connect event's session must carry, by direction: a
 * USER_INITIATED (inbound) connect carries the caller's OFFER; a
 * BUSINESS_INITIATED (outbound) connect carries the user's ANSWER to our
 * own offer. A session whose `sdp_type` doesn't match its direction is
 * treated as invalid — this is what keeps the widened offer|answer schema
 * from silently accepting a mislabeled session.
 */
const expectedSdpTypeForDirection = (
  direction: WhatsappCallDirectionPayload,
): "offer" | "answer" =>
  direction === "businessInitiated" ? "answer" : "offer"

/**
 * Validates a connect event's raw `session` field (VoIP-mode SDP offer or
 * answer, depending on `expectedSdpType`). Length is checked BEFORE the zod
 * parse so an oversized string never pays for schema validation — this runs
 * on the hot webhook path. A present but malformed/oversized/mismatched
 * session returns `"invalid"` (never thrown) so the caller can Meta-reject
 * it; an absent session returns `undefined`.
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
 * R12: normalizes a terminate item's `status` case-insensitively — Meta
 * documents `COMPLETED`/`FAILED` (uppercase), but nothing on the wire
 * guarantees a sender never varies casing. An unrecognized status (any
 * casing) is logged and defaults to `FAILED` rather than silently comparing
 * unequal and always defaulting there.
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
 * logged and skipped so one bad item never blocks the rest of the batch
 * (mirrors the automatic-events extractor).
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

      const { metadata, contacts, calls, statuses } = parsed.data
      const contact = toContactPayload(contacts)

      // Interim statuses are pushed (and therefore enqueued) BEFORE call
      // events: when a batch carries both a REJECTED status and its
      // terminate, the terminate handler must be able to see the rejection
      // to label the call "declined" rather than "missed".
      for (const item of statuses ?? []) {
        const event = normalizeStatusItem(item)
        if (event) {
          payloads.push({
            phoneNumberId: metadata.phone_number_id,
            contact,
            event,
          })
        }
      }

      for (const item of calls ?? []) {
        const event = normalizeCallItem(item)
        if (event) {
          payloads.push({
            phoneNumberId: metadata.phone_number_id,
            contact,
            event,
          })
        }
      }
    }
  }

  return payloads
}
