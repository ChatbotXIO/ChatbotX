import {
  guessFileTypeFromMimeType,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import type {
  EditPatch,
  MediaFollowUp,
  RevokePatch,
} from "./whatsapp-flush-patches"

/**
 * Parser for one buffered WhatsApp Coexistence `changes[].value` slice.
 *
 * Moved verbatim out of `whatsapp-flush.ts` (which was well over the 800-line
 * budget) so the flush file holds the run/state machine and this one holds the
 * payload shapes — see
 * `.superpowers/sdd/2026-09-04-multi-select-channel-connect/coexist-switch/brief-coexist-history-lifecycle.md`.
 * The only behavioural change is `ExtractResult.parseFailed`.
 */
/**
 * WhatsApp Coexistence webhook payloads are loosely documented. Schemas are
 * intentionally permissive (`.passthrough()`, optional fields) — unrecognized
 * shapes are skipped rather than crashing the flush job.
 */
const waProfileSchema = z
  .object({ name: z.string().optional(), username: z.string().optional() })
  .passthrough()

const waContactSchema = z
  .object({
    wa_id: z.string(),
    // Business-Scoped User ID (BSUID): present for WhatsApp Username
    // adopters, alongside a possibly-empty `wa_id` (hidden phone).
    user_id: z.string().optional(),
    profile: waProfileSchema.optional(),
  })
  .passthrough()

const waMediaSchema = z
  .object({
    caption: z.string().optional(),
    mime_type: z.string().optional(),
    sha256: z.string().optional(),
    id: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough()

const waEditSchema = z
  .object({
    original_message_id: z.string(),
    message: z
      .object({
        type: z.string().optional(),
        text: z.object({ body: z.string() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const waRevokeSchema = z
  .object({ original_message_id: z.string() })
  .passthrough()

const waMessageSchema = z
  .object({
    id: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
    // BSUID counterparts of `from`/`to`, present when the phone-based field
    // is an empty string (Meta changelog 2026-06-12).
    from_user_id: z.string().optional(),
    to_user_id: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    text: z.object({ body: z.string() }).passthrough().optional(),
    image: waMediaSchema.optional(),
    video: waMediaSchema.optional(),
    audio: waMediaSchema.optional(),
    document: waMediaSchema.optional(),
    sticker: waMediaSchema.optional(),
    edit: waEditSchema.optional(),
    revoke: waRevokeSchema.optional(),
  })
  .passthrough()

const waThreadSchema = z
  .object({
    id: z.string(),
    // BSUID for this thread's counterparty, present when `id` (wa_id) is an
    // empty string (username adopter with a hidden phone).
    user_id: z.string().optional(),
    messages: z.array(waMessageSchema).optional(),
  })
  .passthrough()

const waHistoryMetadataSchema = z
  .object({
    phase: z.number().optional(),
    chunk_order: z.number().optional(),
    progress: z.number().optional(),
  })
  .passthrough()

const waHistoryErrorSchema = z
  .object({
    code: z.number(),
    title: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough()

const waHistoryEntrySchema = z
  .object({
    threads: z.array(waThreadSchema).optional(),
    metadata: waHistoryMetadataSchema.optional(),
    errors: z.array(waHistoryErrorSchema).optional(),
  })
  .passthrough()

const smbStateSyncEntrySchema = z
  .object({
    type: z.string().optional(),
    action: z.string().optional(),
    contact: z
      .object({
        phone_number: z.string().optional(),
        full_name: z.string().optional(),
        first_name: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

const waEchoSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    // BSUID counterparts of `from`/`to`, present when the phone-based field
    // is an empty string (Meta changelog 2026-06-12).
    from_user_id: z.string().optional(),
    to_user_id: z.string().optional(),
    id: z.string(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    text: z.object({ body: z.string() }).passthrough().optional(),
    image: waMediaSchema.optional(),
    video: waMediaSchema.optional(),
    audio: waMediaSchema.optional(),
    document: waMediaSchema.optional(),
    sticker: waMediaSchema.optional(),
  })
  .passthrough()

const waValueSchema = z
  .object({
    contacts: z.array(waContactSchema).optional(),
    history: z.array(waHistoryEntrySchema).optional(),
    state_sync: z.array(smbStateSyncEntrySchema).optional(),
    message_echoes: z.array(waEchoSchema).optional(),
    smb_app_state_sync: z.array(smbStateSyncEntrySchema).optional(),
    smb_message_echoes: z.array(waEchoSchema).optional(),
    messages: z.array(waMessageSchema).optional(),
  })
  .passthrough()

/** Meta media-type keys carried on a message object. */
const MEDIA_KEYS = ["image", "video", "audio", "document", "sticker"] as const
type MediaKey = (typeof MEDIA_KEYS)[number]

/**
 * Media payloads ride on `.passthrough()` keys, so they are `unknown` at the
 * type level. Read + validate rather than cast: a Meta payload whose media
 * object has an unexpected shape is skipped, not mis-typed.
 */
const extractMedia = (
  message: z.infer<typeof waMessageSchema> | z.infer<typeof waEchoSchema>,
): { fileType: MediaKey; payload: z.infer<typeof waMediaSchema> } | null => {
  for (const key of MEDIA_KEYS) {
    const parsed = waMediaSchema.safeParse(Reflect.get(message, key))
    if (parsed.success) {
      return { fileType: key, payload: parsed.data }
    }
  }
  return null
}

/**
 * Convert one extracted Meta media payload into the SDK shape inserted by
 * `bulkImportMessages` / `applyMediaFollowUps`. The Coexist webhook delivers
 * only `mediaId` for thread + echo messages — never a direct URL — so we
 * stash the id in `originPath` with the `wa-media:` sentinel. The follow-up
 * `coexistAttachmentDownload` job resolves it via `client.retrieveMedia(id)`,
 * mirrors the bytes to S3, and rewrites `originPath` to the S3 path.
 *
 * Returns null when no mediaId is present — a placeholder media stub we
 * cannot resolve.
 */
const buildWaIncomingAttachment = (
  _fileType: MediaKey,
  payload: z.infer<typeof waMediaSchema>,
): IncomingAttachment | null => {
  if (!payload.id) {
    return null
  }
  const mimeType = payload.mime_type ?? "application/octet-stream"
  return {
    sourceId: payload.id,
    fileType: guessFileTypeFromMimeType(mimeType),
    mimeType,
    originPath: `wa-media:${payload.id}`,
    size: 0,
    width: null,
    height: null,
    name: payload.caption,
  }
}

/** History-decline error code per Meta docs. */
const HISTORY_DECLINED_ERROR_CODE = 2_593_109

export type HistoryMetadata = {
  phase: number
  chunkOrder: number
  progress: number
}

/**
 * Keeps the furthest point Meta has reached: lexicographic by
 * `(phase, progress, chunkOrder)` — highest phase wins, then the highest
 * progress WITHIN that phase, then chunkOrder.
 *
 * Phase must outrank progress. Meta's `progress` is per phase, so reducing by
 * progress alone paired the max phase with some *other* phase's progress: a
 * drain carrying `phase 0 @100` and `phase 2 @40` read as "phase 2 at 100%" and
 * closed the run mid-backfill. Ordered this way, the persisted
 * `(lastPhase, syncProgress)` pair is an exact encoding of the terminal signal,
 * which is what the resume seed and the end-of-drain fallback rely on.
 *
 * Used twice: inside extractFromValue across history entries, and across
 * staging rows in the flush loop.
 */
export const reduceMetadata = (
  current: HistoryMetadata | null,
  next: HistoryMetadata,
): HistoryMetadata => {
  if (current === null) {
    return next
  }
  if (next.phase !== current.phase) {
    return next.phase > current.phase ? next : current
  }
  if (next.progress !== current.progress) {
    return next.progress > current.progress ? next : current
  }
  return next.chunkOrder > current.chunkOrder ? next : current
}

export type ExtractResult = {
  entries: ContactWithMessage[]
  mediaFollowUps: MediaFollowUp[]
  edits: EditPatch[]
  revokes: RevokePatch[]
  declined: boolean
  /**
   * The furthest metadata in this payload, reduced lexicographically by
   * (phase, progress, chunkOrder). Persisted as `lastPhase` / `syncProgress` /
   * `lastChunkOrder`, which together encode exactly how far Meta got — the
   * terminal signal (phase 2 at progress 100) is readable straight from it.
   */
  metadata: HistoryMetadata | null
  /**
   * EVERY history metadata entry in this payload, in delivery order. The flush
   * also checks the terminal signal per entry, which is cheaper than waiting
   * for the reduction and covers a payload whose entries arrive out of order.
   */
  metadataEntries: HistoryMetadata[]
  /**
   * The payload did not match the (already very permissive) value schema at
   * all — a Meta schema change. The caller parks the staging row via
   * `parseFailedAt` instead of marking it processed, so the data is not lost
   * silently and the row still cannot block the run.
   */
  parseFailed: boolean
}

export type ContactWithMessage = {
  contact: IncomingContact
  message: (IncomingMessage & { createdAt?: Date }) | null
}

/**
 * Determines whether a thread message/echo was sent BY the customer
 * (incoming) or by the business (outgoing). Prefers the phone-based `from`
 * field (today's behavior, regression-safe); falls back to comparing the
 * BSUID counterpart (`fromUserId`) against the thread's resolved scoped user
 * id when `from` is an empty string (username adopter, D7 in the BSUID
 * plan) — deterministic, no phone-format sniffing.
 */
const resolveIsOutgoingMessage = (props: {
  from: string | undefined
  fromUserId: string | undefined
  customerWaId: string
  customerUserId: string | undefined
}): boolean => {
  const { from, fromUserId, customerWaId, customerUserId } = props
  if (from) {
    return from !== customerWaId
  }
  if (fromUserId && customerUserId) {
    return fromUserId !== customerUserId
  }
  return false
}

const toDate = (timestamp: string | number | undefined): Date | undefined => {
  if (timestamp === undefined) {
    return
  }
  const seconds = Number(timestamp)
  if (Number.isFinite(seconds)) {
    return new Date(seconds * 1000)
  }
}

const EMPTY_EXTRACT: ExtractResult = {
  entries: [],
  mediaFollowUps: [],
  edits: [],
  revokes: [],
  declined: false,
  metadata: null,
  metadataEntries: [],
  parseFailed: false,
}

/**
 * Extracts contacts + historical messages + post-batch patches from one
 * buffered `changes[].value` slice.
 *
 * Group chats are not synced by WhatsApp Coexistence, so every thread here is
 * a 1:1 conversation keyed by the customer `wa_id`.
 *
 * Five Meta payload shapes are recognized:
 *   - `value.history[].threads[]`            → historical text/media messages
 *   - `value.history[].errors[code=2593109]` → history-sharing declined
 *   - `value.history[].metadata`             → phase/chunk_order/progress
 *   - `value.smb_app_state_sync[]`           → contact backfill
 *   - `value.smb_message_echoes[]`           → outgoing messages from WA Business app
 *   - `value.messages[]`                     → media-asset follow-up / edit / revoke
 */
// Exported for direct unit testing of the BSUID/username extraction and
// direction-resolution logic — the full `coexistWhatsappFlush` orchestration
// (DB queries, bulk import, run-state machine) is tested separately.
type WaIdentityLookups = {
  nameByWaId: Map<string, string>
  userIdByWaId: Map<string, string>
  usernameByWaId: Map<string, string>
}

/**
 * Builds the coexist `IncomingContact` for a raw wa_id + optional scoped user
 * id. Username adopters: Meta can send an empty wa_id (hidden phone)
 * alongside a Business-Scoped User ID — fall back to it instead of dropping
 * the row (D2/D7 in the BSUID plan; deterministic, no phone-format sniffing).
 */
const buildCoexistIncomingContact = (
  rawWaId: string,
  rawUserId: string | undefined,
  lookups: WaIdentityLookups,
): {
  contact: IncomingContact
  customerWaId: string
  customerUserId: string | undefined
} => {
  const customerUserId = rawUserId ?? lookups.userIdByWaId.get(rawWaId)
  const customerWaId = rawWaId || customerUserId || ""
  const sourceUsername = lookups.usernameByWaId.get(rawWaId)
  return {
    customerWaId,
    customerUserId,
    contact: {
      sourceId: customerWaId,
      // Only a real wa_id is a phone number — never the BSUID fallback.
      ...(rawWaId ? { phoneNumber: rawWaId } : {}),
      firstName: lookups.nameByWaId.get(rawWaId),
      ...(customerUserId ? { sourceUserId: customerUserId } : {}),
      ...(sourceUsername ? { sourceUsername } : {}),
    },
  }
}

type WaValue = z.infer<typeof waValueSchema>
type ContactLookups = {
  nameByWaId: Map<string, string>
  userIdByWaId: Map<string, string>
  usernameByWaId: Map<string, string>
}

/** The `contacts[]` block indexed by wa_id, so threads/echoes can name their contact. */
const buildContactLookups = (value: WaValue): ContactLookups => {
  const lookups: ContactLookups = {
    nameByWaId: new Map(),
    userIdByWaId: new Map(),
    usernameByWaId: new Map(),
  }
  for (const contact of value.contacts ?? []) {
    if (contact.profile?.name) {
      lookups.nameByWaId.set(contact.wa_id, contact.profile.name)
    }
    if (contact.user_id) {
      lookups.userIdByWaId.set(contact.wa_id, contact.user_id)
    }
    if (contact.profile?.username) {
      lookups.usernameByWaId.set(contact.wa_id, contact.profile.username)
    }
  }
  return lookups
}

/** Accumulator every `collect*` pass below appends to. */
type ExtractAccumulator = {
  entries: ContactWithMessage[]
  mediaFollowUps: MediaFollowUp[]
  edits: EditPatch[]
  revokes: RevokePatch[]
  metadataEntries: HistoryMetadata[]
  metadata: HistoryMetadata | null
  declined: boolean
}

/** One thread's messages, minus Meta's undecodable `type: "errors"` placeholders. */
const collectThread = (
  thread: NonNullable<
    NonNullable<WaValue["history"]>[number]["threads"]
  >[number],
  lookups: ContactLookups,
  acc: ExtractAccumulator,
): void => {
  const { contact, customerWaId, customerUserId } = buildCoexistIncomingContact(
    thread.id,
    thread.user_id,
    lookups,
  )

  const rawMessages = thread.messages ?? []
  // Skip type="errors" entries — Meta could not decode the message (e.g. code
  // 131051 "Message type unknown"). They carry no usable content and are not
  // user-authored.
  const messages = rawMessages.filter((m) => m.type !== "errors")

  // Thread had only error placeholders → contact is meaningless, skip.
  if (rawMessages.length > 0 && messages.length === 0) {
    return
  }
  if (messages.length === 0) {
    acc.entries.push({ contact, message: null })
    return
  }

  for (const message of messages) {
    const isOutgoing = resolveIsOutgoingMessage({
      from: message.from,
      fromUserId: message.from_user_id,
      customerWaId,
      customerUserId,
    })
    const text = message.text?.body ?? (message.type ? `[${message.type}]` : "")
    const media = extractMedia(message)
    const attachment = media
      ? buildWaIncomingAttachment(media.fileType, media.payload)
      : null
    acc.entries.push({
      contact,
      message: {
        sourceId: message.id,
        messageType: isOutgoing ? "outgoing" : "incoming",
        contentType: "text",
        text,
        createdAt: toDate(message.timestamp),
        ...(attachment ? { attachments: [attachment] } : {}),
      },
    })
  }
}

/** The `history[]` block: decline errors, phase metadata and the threads. */
const collectHistory = (
  value: WaValue,
  lookups: ContactLookups,
  acc: ExtractAccumulator,
): void => {
  for (const entry of value.history ?? []) {
    if (entry.errors?.some((e) => e.code === HISTORY_DECLINED_ERROR_CODE)) {
      acc.declined = true
    }
    if (entry.metadata) {
      const parsedMetadata: HistoryMetadata = {
        phase: entry.metadata.phase ?? 0,
        chunkOrder: entry.metadata.chunk_order ?? 0,
        progress: entry.metadata.progress ?? 0,
      }
      acc.metadataEntries.push(parsedMetadata)
      acc.metadata = reduceMetadata(acc.metadata, parsedMetadata)
    }
    for (const thread of entry.threads ?? []) {
      collectThread(thread, lookups, acc)
    }
  }
}

/** Contact-only rows from the two state-sync blocks — no message activity. */
const collectStateSync = (value: WaValue, acc: ExtractAccumulator): void => {
  for (const entry of [
    ...(value.smb_app_state_sync ?? []),
    ...(value.state_sync ?? []),
  ]) {
    if (entry.action === "remove" || !entry.contact?.phone_number) {
      continue
    }
    const phone = entry.contact.phone_number
    acc.entries.push({
      contact: {
        sourceId: phone,
        phoneNumber: phone,
        firstName: entry.contact.first_name ?? entry.contact.full_name,
      },
      message: null,
    })
  }
}

/** Business-authored messages, keyed on the recipient (`echo.to`). */
const collectEchoes = (
  value: WaValue,
  lookups: ContactLookups,
  acc: ExtractAccumulator,
): void => {
  for (const echo of [
    ...(value.smb_message_echoes ?? []),
    ...(value.message_echoes ?? []),
  ]) {
    const { contact } = buildCoexistIncomingContact(
      echo.to,
      echo.to_user_id,
      lookups,
    )
    const text = echo.text?.body ?? (echo.type ? `[${echo.type}]` : "")
    const media = extractMedia(echo)
    const attachment = media
      ? buildWaIncomingAttachment(media.fileType, media.payload)
      : null
    acc.entries.push({
      contact,
      message: {
        sourceId: echo.id,
        messageType: "outgoing",
        contentType: "text",
        text,
        createdAt: toDate(echo.timestamp),
        ...(attachment ? { attachments: [attachment] } : {}),
      },
    })
  }
}

/**
 * The `messages[]` block: revokes, edits and media follow-ups — the three
 * families that PATCH a message the history block already delivered.
 */
const collectPatches = (value: WaValue, acc: ExtractAccumulator): void => {
  for (const message of value.messages ?? []) {
    // Username adopters: fall back to the BSUID when `from` is an empty string
    // (D2/D7) so patches still resolve to the right ContactInbox instead of
    // being dropped.
    const contactWaId = message.from || message.from_user_id
    if (message.type === "revoke" || message.revoke) {
      const original = message.revoke?.original_message_id
      if (original && contactWaId) {
        acc.revokes.push({ sourceId: original, contactWaId })
      }
      continue
    }
    if (message.type === "edit" || message.edit) {
      collectEdit(message, contactWaId, acc)
      continue
    }

    const media = extractMedia(message)
    const attachment =
      media && contactWaId
        ? buildWaIncomingAttachment(media.fileType, media.payload)
        : null
    if (attachment && contactWaId) {
      acc.mediaFollowUps.push({
        sourceId: message.id,
        contactWaId,
        attachment,
      })
    }
  }
}

const collectEdit = (
  message: NonNullable<WaValue["messages"]>[number],
  contactWaId: string | undefined,
  acc: ExtractAccumulator,
): void => {
  const original = message.edit?.original_message_id
  if (!(original && contactWaId)) {
    return
  }
  // The edit's replacement message is a passthrough value — validate it
  // instead of casting.
  const editedMediaSource = waMessageSchema.safeParse(message.edit?.message)
  const editedMedia = editedMediaSource.success
    ? extractMedia(editedMediaSource.data)
    : null
  acc.edits.push({
    sourceId: original,
    contactWaId,
    text: message.edit?.message?.text?.body ?? null,
    attachment: editedMedia
      ? buildWaIncomingAttachment(editedMedia.fileType, editedMedia.payload)
      : null,
  })
}

/**
 * Turns one staged Meta Coexistence payload into the contacts, messages,
 * post-batch patches and history metadata the flush imports. One pass per
 * payload block, all appending to a single accumulator.
 */
export const extractFromValue = (payload: unknown): ExtractResult => {
  const parsed = waValueSchema.safeParse(payload)
  if (!parsed.success) {
    // Do NOT swallow this: the caller parks the row with `parseFailedAt` so a
    // Meta schema change is visible in the error log and the payload survives
    // for a week instead of being marked processed and purged.
    return { ...EMPTY_EXTRACT, parseFailed: true }
  }
  const value = parsed.data
  const lookups = buildContactLookups(value)

  const acc: ExtractAccumulator = {
    entries: [],
    mediaFollowUps: [],
    edits: [],
    revokes: [],
    metadataEntries: [],
    metadata: null,
    declined: false,
  }

  collectHistory(value, lookups, acc)
  collectStateSync(value, acc)
  collectEchoes(value, lookups, acc)
  collectPatches(value, acc)

  return { ...acc, parseFailed: false }
}
