import {
  and,
  db,
  eq,
  findOrFail,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import {
  coexistSyncRunModel,
  contactInboxModel,
  inboxModel,
  integrationWhatsappModel,
  whatsappCoexistStagingModel,
} from "@chatbotx.io/database/schema"
import {
  guessFileTypeFromMimeType,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  IntegrationJobAction,
  type IntegrationJobCoexistWhatsappFlush,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import {
  bulkImportHistorical,
  type HistoricalContactMessages,
} from "./bulk-historical-import"

/**
 * WhatsApp Coexistence webhook payloads are loosely documented. Schemas are
 * intentionally permissive (`.passthrough()`, optional fields) — unrecognized
 * shapes are skipped rather than crashing the flush job.
 */
const waProfileSchema = z.object({ name: z.string().optional() }).passthrough()

const waContactSchema = z
  .object({ wa_id: z.string(), profile: waProfileSchema.optional() })
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

const extractMedia = (
  msg: z.infer<typeof waMessageSchema> | z.infer<typeof waEchoSchema>,
): { fileType: MediaKey; payload: z.infer<typeof waMediaSchema> } | null => {
  for (const key of MEDIA_KEYS) {
    const payload = (msg as Record<string, unknown>)[key]
    if (payload && typeof payload === "object") {
      return {
        fileType: key,
        payload: payload as z.infer<typeof waMediaSchema>,
      }
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

/**
 * Media follow-up: `value.messages[]` carries the media asset for a thread
 * message Meta sent earlier. The history row is already in `Message`; we
 * insert an Attachment row pointing at the resolved (contactInboxId, sourceId)
 * → messageId. Followed by a `coexistAttachmentDownload` enqueue.
 */
type MediaFollowUp = {
  sourceId: string
  contactWaId: string
  attachment: IncomingAttachment
}

type EditPatch = {
  sourceId: string
  contactWaId: string
  text: string | null
  /** When the edit carries new media, an Attachment row is inserted in
   *  addition to the text UPDATE. Null when text-only edit. */
  attachment: IncomingAttachment | null
}

type RevokePatch = {
  sourceId: string
  contactWaId: string
}

type HistoryMetadata = {
  phase: number
  chunkOrder: number
  progress: number
}

// Pick the metadata row with the highest progress (ties broken by chunkOrder).
// Used twice: inside extractFromValue across history entries, and across
// staging rows in the flush loop.
const reduceMetadata = (
  current: HistoryMetadata | null,
  next: HistoryMetadata,
): HistoryMetadata => {
  if (current === null) {
    return next
  }
  if (next.progress > current.progress) {
    return next
  }
  if (
    next.progress === current.progress &&
    next.chunkOrder > current.chunkOrder
  ) {
    return next
  }
  return current
}

type ExtractResult = {
  entries: ContactWithMessage[]
  mediaFollowUps: MediaFollowUp[]
  edits: EditPatch[]
  revokes: RevokePatch[]
  declined: boolean
  metadata: HistoryMetadata | null
}

type ContactWithMessage = {
  contact: IncomingContact
  message: (IncomingMessage & { createdAt?: Date }) | null
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
const extractFromValue = (payload: unknown): ExtractResult => {
  const parsed = waValueSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn(
      { error: parsed.error.message },
      "[coexist] Unrecognized WhatsApp history payload — skipped",
    )
    return EMPTY_EXTRACT
  }
  const value = parsed.data

  const nameByWaId = new Map<string, string>()
  for (const contact of value.contacts ?? []) {
    if (contact.profile?.name) {
      nameByWaId.set(contact.wa_id, contact.profile.name)
    }
  }

  const entries: ContactWithMessage[] = []
  const mediaFollowUps: MediaFollowUp[] = []
  const edits: EditPatch[] = []
  const revokes: RevokePatch[] = []
  let declined = false
  let metadata: HistoryMetadata | null = null

  for (const entry of value.history ?? []) {
    if (entry.errors?.some((e) => e.code === HISTORY_DECLINED_ERROR_CODE)) {
      declined = true
    }
    if (entry.metadata) {
      metadata = reduceMetadata(metadata, {
        phase: entry.metadata.phase ?? 0,
        chunkOrder: entry.metadata.chunk_order ?? 0,
        progress: entry.metadata.progress ?? 0,
      })
    }

    for (const thread of entry.threads ?? []) {
      const customerWaId = thread.id
      const contact: IncomingContact = {
        sourceId: customerWaId,
        phoneNumber: customerWaId,
        firstName: nameByWaId.get(customerWaId),
      }

      const rawMessages = thread.messages ?? []
      // Skip type="errors" entries — Meta could not decode the message
      // (e.g. code 131051 "Message type unknown"). They carry no usable
      // content and are not user-authored.
      const messages = rawMessages.filter((m) => m.type !== "errors")

      // Thread had only error placeholders → contact is meaningless, skip.
      if (rawMessages.length > 0 && messages.length === 0) {
        continue
      }

      if (messages.length === 0) {
        entries.push({ contact, message: null })
        continue
      }

      for (const message of messages) {
        const isOutgoing = message.from !== customerWaId
        const text =
          message.text?.body ?? (message.type ? `[${message.type}]` : "")
        const media = extractMedia(message)
        const attachment = media
          ? buildWaIncomingAttachment(media.fileType, media.payload)
          : null
        entries.push({
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
  }

  for (const entry of [
    ...(value.smb_app_state_sync ?? []),
    ...(value.state_sync ?? []),
  ]) {
    if (entry.action === "remove" || !entry.contact?.phone_number) {
      continue
    }
    const phone = entry.contact.phone_number
    entries.push({
      contact: {
        sourceId: phone,
        phoneNumber: phone,
        firstName: entry.contact.first_name ?? entry.contact.full_name,
      },
      message: null,
    })
  }

  for (const echo of [
    ...(value.smb_message_echoes ?? []),
    ...(value.message_echoes ?? []),
  ]) {
    const customerWaId = echo.to
    const contact: IncomingContact = {
      sourceId: customerWaId,
      phoneNumber: customerWaId,
      firstName: nameByWaId.get(customerWaId),
    }
    const text = echo.text?.body ?? (echo.type ? `[${echo.type}]` : "")
    const media = extractMedia(echo)
    const attachment = media
      ? buildWaIncomingAttachment(media.fileType, media.payload)
      : null
    entries.push({
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

  for (const message of value.messages ?? []) {
    if (message.type === "revoke" || message.revoke) {
      const original = message.revoke?.original_message_id
      const contactWaId = message.from
      if (original && contactWaId) {
        revokes.push({ sourceId: original, contactWaId })
      }
      continue
    }
    if (message.type === "edit" || message.edit) {
      const original = message.edit?.original_message_id
      const contactWaId = message.from
      if (!(original && contactWaId)) {
        continue
      }
      const editedText = message.edit?.message?.text?.body ?? null
      const editedMediaSource = message.edit?.message as
        | z.infer<typeof waMessageSchema>
        | undefined
      const editedMedia = editedMediaSource
        ? extractMedia(editedMediaSource)
        : null
      const editedAttachment = editedMedia
        ? buildWaIncomingAttachment(editedMedia.fileType, editedMedia.payload)
        : null
      edits.push({
        sourceId: original,
        contactWaId,
        text: editedText,
        attachment: editedAttachment,
      })
      continue
    }

    const media = extractMedia(message)
    if (media && message.from) {
      const attachment = buildWaIncomingAttachment(
        media.fileType,
        media.payload,
      )
      if (attachment) {
        mediaFollowUps.push({
          sourceId: message.id,
          contactWaId: message.from,
          attachment,
        })
      }
    }
  }

  return { entries, mediaFollowUps, edits, revokes, declined, metadata }
}

/**
 * Resolves a set of customer wa_ids to their ContactInbox rows for this inbox.
 * Returns a Map keyed by sourceId (= wa_id). Missing keys mean either Meta
 * delivered a media follow-up before the history insert (next chunk picks it
 * up) or the contact was cap-rejected by bulkImportHistorical.
 */
const resolveContactInboxIds = async (
  inboxId: string,
  contactWaIds: string[],
): Promise<
  Map<
    string,
    { id: string; lastIncomingMessageAt: Date | null; createdAt: Date }
  >
> => {
  const ids = new Map<
    string,
    { id: string; lastIncomingMessageAt: Date | null; createdAt: Date }
  >()
  if (contactWaIds.length === 0) {
    return ids
  }
  const uniq = Array.from(new Set(contactWaIds))
  const rows = await db
    .select({
      id: contactInboxModel.id,
      sourceId: contactInboxModel.sourceId,
      lastIncomingMessageAt: contactInboxModel.lastIncomingMessageAt,
      createdAt: contactInboxModel.createdAt,
    })
    .from(contactInboxModel)
    .where(
      and(
        eq(contactInboxModel.inboxId, inboxId),
        inArray(contactInboxModel.sourceId, uniq),
      ),
    )
  for (const row of rows) {
    if (row.sourceId) {
      ids.set(row.sourceId, {
        id: row.id,
        lastIncomingMessageAt: row.lastIncomingMessageAt,
        createdAt: row.createdAt,
      })
    }
  }
  return ids
}

/**
 * Applies the three post-batch patch families that bulkImportHistorical cannot
 * express (insert-only contract):
 *
 *   - Media follow-ups → INSERT one Attachment row per follow-up, pointing at
 *     the existing Message row. Returned IDs are enqueued for download by the
 *     caller. Drops silently when the parent message hasn't been inserted yet.
 *   - Edits → UPDATE text and merge `edited: true` into contentAttributes.
 *     When the edit carries media, also INSERT a fresh Attachment row.
 *   - Revokes → merge `revoked: true` into contentAttributes (text retained).
 *
 * Returns the Attachment IDs inserted in this batch so the caller can enqueue
 * `coexistAttachmentDownload` jobs after the flush UPDATEs commit.
 */
const applyPostBatchPatches = async (input: {
  workspaceId: string
  inboxId: string
  mediaFollowUps: MediaFollowUp[]
  edits: EditPatch[]
  revokes: RevokePatch[]
}): Promise<{ insertedAttachmentIds: string[] }> => {
  const { workspaceId, inboxId, mediaFollowUps, edits, revokes } = input
  const insertedAttachmentIds: string[] = []
  if (
    mediaFollowUps.length === 0 &&
    edits.length === 0 &&
    revokes.length === 0
  ) {
    return { insertedAttachmentIds }
  }
  const allWaIds = [
    ...mediaFollowUps.map((p) => p.contactWaId),
    ...edits.map((p) => p.contactWaId),
    ...revokes.map((p) => p.contactWaId),
  ]
  const contactInboxByWaId = await resolveContactInboxIds(inboxId, allWaIds)
  const safeSinceTimes = Array.from(contactInboxByWaId.values())
    .map((contactInbox) =>
      getSafeSinceTime(
        contactInbox.lastIncomingMessageAt ?? contactInbox.createdAt,
        365 * 24 * 60 * 60 * 1000,
      ),
    )
    .filter((value): value is Date => value !== undefined)
  if (safeSinceTimes.length === 0) {
    return { insertedAttachmentIds }
  }
  const sinceTime = new Date(
    Math.min(...safeSinceTimes.map((value) => value.getTime())),
  )
  const repo = await createMessageRepository(db)

  // Pre-load message rows for both attachment-inserting paths (follow-ups +
  // edits-with-media). Single round-trip per batch.
  const attachmentInsertPatches = [
    ...mediaFollowUps,
    ...edits
      .filter((e) => e.attachment !== null)
      .map((e) => ({
        sourceId: e.sourceId,
        contactWaId: e.contactWaId,
        attachment: e.attachment as IncomingAttachment,
      })),
  ]
  const lookupContactInboxIds: string[] = []
  const lookupSourceIds: string[] = []
  for (const patch of attachmentInsertPatches) {
    const contactInbox = contactInboxByWaId.get(patch.contactWaId)
    if (contactInbox) {
      lookupContactInboxIds.push(contactInbox.id)
      lookupSourceIds.push(patch.sourceId)
    }
  }
  const messageRows = await repo.findManyBySourceIds({
    contactInboxIds: lookupContactInboxIds,
    sourceIds: lookupSourceIds,
    workspaceId,
    sinceTime,
  })
  const messageByKey = new Map(
    messageRows
      .filter((row) => row.sourceId)
      .map((row) => [`${row.contactInboxId}:${row.sourceId}`, row]),
  )

  const attachmentRows: Parameters<typeof repo.bulkCreateAttachments>[0] = []
  for (const patch of attachmentInsertPatches) {
    const contactInbox = contactInboxByWaId.get(patch.contactWaId)
    if (!contactInbox) {
      continue
    }
    const msg = messageByKey.get(`${contactInbox.id}:${patch.sourceId}`)
    if (!msg) {
      continue
    }
    attachmentRows.push({
      id: createId(),
      workspaceId,
      conversationId: msg.conversationId,
      messageId: msg.id,
      messageCreatedAt: msg.createdAt,
      sourceId: patch.attachment.sourceId,
      fileType: patch.attachment.fileType,
      mimeType: patch.attachment.mimeType,
      originPath: patch.attachment.originPath,
      size: patch.attachment.size,
      width: patch.attachment.width ?? undefined,
      height: patch.attachment.height ?? undefined,
      name: patch.attachment.name,
    })
  }
  if (attachmentRows.length > 0) {
    const inserted = await repo.bulkCreateAttachments(attachmentRows)
    for (const r of inserted) {
      insertedAttachmentIds.push(r.id)
    }
  }

  const patches = [
    ...edits.flatMap((patch) => {
      const contactInbox = contactInboxByWaId.get(patch.contactWaId)
      if (!contactInbox) {
        return []
      }
      return [
        {
          contactInboxId: contactInbox.id,
          sourceId: patch.sourceId,
          overlay: { edited: true },
          text: patch.text === null ? undefined : patch.text,
        },
      ]
    }),
    ...revokes.flatMap((patch) => {
      const contactInbox = contactInboxByWaId.get(patch.contactWaId)
      if (!contactInbox) {
        return []
      }
      return [
        {
          contactInboxId: contactInbox.id,
          sourceId: patch.sourceId,
          overlay: { revoked: true },
        },
      ]
    }),
  ]

  await repo.bulkPatchContentAttributes({ workspaceId, patches, sinceTime })

  return { insertedAttachmentIds }
}

/** Staging rows processed per chunk. Tuned for ~30s wall-time per chunk. */
const BATCH_SIZE = 100

/**
 * Active wall-time budget per chunk. When exceeded, the job persists state and
 * either hot-chains a continuation enqueue or yields to the scheduler.
 */
const CHUNK_BUDGET_MS = 4 * 60 * 1000

/**
 * Drains buffered WhatsApp staging rows into Contact/ContactInbox/Message via
 * the bulk pipeline. Page-per-job pattern: one chunk per invocation, then
 * either hot-chain a continuation enqueue or yield to the scheduler.
 *
 * Gated by `coexistEnabled` — a no-op when the user has not confirmed the
 * popup. Idempotent: safe to re-run as more history arrives over the ~24h
 * window Meta uses to push it.
 */
export const coexistWhatsappFlush = async (
  data: IntegrationJobCoexistWhatsappFlush["data"],
): Promise<void> => {
  const { phoneNumberId } = data
  const jobStart = Date.now()

  const integration = await db.query.integrationWhatsappModel.findFirst({
    where: { phoneNumberId },
  })
  if (!integration) {
    logger.warn({ phoneNumberId }, "[coexist] Flush: WhatsApp integration gone")
    return
  }
  if (!integration.coexistEnabled) {
    logger.info(
      { phoneNumberId },
      "[coexist] Flush skipped — coexist disabled, payloads remain staged",
    )
    return
  }

  // Resolve runId. Webhook-driven enqueues omit it (delayed + jobId-dedup);
  // scheduler + self-continuation pass it explicitly. Lookup picks the
  // newest non-terminal run owned by popup-enable.
  let runId = data.runId
  if (!runId) {
    const liveRun = await db.query.coexistSyncRunModel.findFirst({
      where: {
        integrationId: integration.id,
        channel: "whatsapp",
        status: { in: ["init", "running"] },
      },
      columns: { id: true },
      orderBy: { createdAt: "desc" },
    })
    if (!liveRun) {
      logger.info(
        { phoneNumberId },
        "[coexist] Flush: no live run — payloads remain staged",
      )
      return
    }
    runId = liveRun.id
  }

  // Optimistic claim FIRST — avoids wasting a SELECT + inbox lookup if another
  // worker already owns this run. 10-minute stale heartbeat fallback recovers
  // a crashed prior worker. `startedAt` uses COALESCE so the FIRST chunk's
  // start is preserved across resume.
  const claimed = await db
    .update(coexistSyncRunModel)
    .set({
      status: "running",
      startedAt: sql`COALESCE(${coexistSyncRunModel.startedAt}, NOW())`,
      lastHeartbeatAt: new Date(),
    })
    .where(
      and(
        eq(coexistSyncRunModel.id, runId),
        or(
          ne(coexistSyncRunModel.status, "running"),
          lt(
            coexistSyncRunModel.lastHeartbeatAt,
            sql`NOW() - INTERVAL '10 minutes'`,
          ),
        ),
      ),
    )
    .returning({ id: coexistSyncRunModel.id })

  if (claimed.length === 0) {
    logger.warn(
      { runId, phoneNumberId },
      "[coexist] WhatsApp flush run already claimed by another worker — abandoning",
    )
    return
  }

  // ── Read resume state (after claim — counter values are stable now) ──────
  const [runRow] = await db
    .select({
      workspaceId: coexistSyncRunModel.workspaceId,
      currentPageNumber: coexistSyncRunModel.currentPageNumber,
      attempts: coexistSyncRunModel.attempts,
      importedContactCount: coexistSyncRunModel.importedContactCount,
      importedMessageCount: coexistSyncRunModel.importedMessageCount,
      skippedCount: coexistSyncRunModel.skippedCount,
      failedCount: coexistSyncRunModel.failedCount,
      currentScan: coexistSyncRunModel.currentScan,
      currentError: coexistSyncRunModel.currentError,
    })
    .from(coexistSyncRunModel)
    .where(eq(coexistSyncRunModel.id, runId))
    .limit(1)

  if (!runRow) {
    logger.warn({ runId }, "[coexist] Flush: CoexistSyncRun row missing")
    return
  }

  // Cross-tenant guard: refuse if integration's workspaceId doesn't match
  // the run's workspaceId (defends against phoneNumberId collisions or
  // stale job payloads referencing a re-assigned integration).
  if (integration.workspaceId !== runRow.workspaceId) {
    logger.warn(
      {
        phoneNumberId,
        runId,
        integrationWorkspaceId: integration.workspaceId,
        runWorkspaceId: runRow.workspaceId,
      },
      "[coexist] Flush: workspaceId mismatch — refusing",
    )
    await db
      .update(coexistSyncRunModel)
      .set({
        status: "failed",
        currentError: "workspaceId mismatch between integration and run",
        finishedAt: new Date(),
      })
      .where(eq(coexistSyncRunModel.id, runId))
    return
  }

  const inbox = await findOrFail({
    table: inboxModel,
    where: { id: integration.inboxId },
    message: "Inbox not found",
  })

  let importedContacts = runRow.importedContactCount
  let importedMessages = runRow.importedMessageCount
  let skipped = runRow.skippedCount
  let failed = runRow.failedCount
  let totalRows = runRow.currentScan
  let batchNumber = runRow.currentPageNumber
  const attempts = runRow.attempts

  let finalStatus: "succeeded" | "failed" | "partial" | null = null
  // Carry prior attempt's error so retry doesn't wipe it. New errors during
  // this attempt will overwrite via the per-batch UPDATE or outer catch.
  let finalError: string | undefined = runRow.currentError ?? undefined
  let continueLater = false
  let exhausted = false

  try {
    while (true) {
      if (Date.now() - jobStart >= CHUNK_BUDGET_MS) {
        continueLater = true
        break
      }

      batchNumber += 1
      // Pre-batch heartbeat only — counters + currentStep are written at
      // batch end. Keeps the stale-claim window honest while bulk import runs.
      await db
        .update(coexistSyncRunModel)
        .set({ lastHeartbeatAt: new Date() })
        .where(eq(coexistSyncRunModel.id, runId))

      const stagedRows = await db
        .select()
        .from(whatsappCoexistStagingModel)
        .where(
          and(
            eq(whatsappCoexistStagingModel.phoneNumberId, phoneNumberId),
            isNull(whatsappCoexistStagingModel.processedAt),
          ),
        )
        .orderBy(whatsappCoexistStagingModel.id)
        .limit(BATCH_SIZE)

      if (stagedRows.length === 0) {
        exhausted = true
        break
      }

      // Flatten + coalesce per sourceId across rows in this batch. Also
      // accumulate post-batch patches (media follow-ups, edits, revokes),
      // a decline flag, and the highest-progress history metadata seen.
      const rowGroups = new Map<string, ContactWithMessage[]>()
      const batchMediaFollowUps: MediaFollowUp[] = []
      const batchEdits: EditPatch[] = []
      const batchRevokes: RevokePatch[] = []
      let batchDeclined = false
      let batchMetadata: HistoryMetadata | null = null
      for (const row of stagedRows) {
        const extracted = extractFromValue(row.payload)
        for (const e of extracted.entries) {
          if (!e.contact.sourceId) {
            continue
          }
          const group = rowGroups.get(e.contact.sourceId) ?? []
          group.push(e)
          rowGroups.set(e.contact.sourceId, group)
        }
        batchMediaFollowUps.push(...extracted.mediaFollowUps)
        batchEdits.push(...extracted.edits)
        batchRevokes.push(...extracted.revokes)
        if (extracted.declined) {
          batchDeclined = true
        }
        if (extracted.metadata) {
          batchMetadata = reduceMetadata(batchMetadata, extracted.metadata)
        }
      }

      const flat: HistoricalContactMessages[] = []
      for (const entries of rowGroups.values()) {
        // Coalesce contact fields across entries (first non-null wins).
        // Seed from entries[0] so sourceId is non-empty from the start.
        const [first, ...rest] = entries
        const merged: IncomingContact = rest.reduce<IncomingContact>(
          (acc, e) => ({
            sourceId: acc.sourceId,
            phoneNumber: acc.phoneNumber ?? e.contact.phoneNumber,
            phoneNumberId: acc.phoneNumberId ?? e.contact.phoneNumberId,
            firstName: acc.firstName ?? e.contact.firstName,
            lastName: acc.lastName ?? e.contact.lastName,
            email: acc.email ?? e.contact.email,
            avatar: acc.avatar ?? e.contact.avatar,
            gender: acc.gender ?? e.contact.gender,
          }),
          first.contact,
        )
        const messages = entries.flatMap((e) => (e.message ? [e.message] : []))
        flat.push({ contact: merged, messages })
      }

      let batchResult: Awaited<ReturnType<typeof bulkImportHistorical>>
      try {
        batchResult = await bulkImportHistorical({
          inbox,
          workspaceId: integration.workspaceId,
          runId,
          batch: flat,
        })
      } catch (error) {
        // Count every message in this batch as failed; staging rows are NOT
        // marked processed → scheduler retries the batch. Outer catch + finally
        // write the final counters, so no per-batch UPDATE is needed here.
        failed += flat.reduce((sum, b) => sum + b.messages.length, 0)
        totalRows += stagedRows.length
        logger.error(
          { error, runId, batchNumber },
          "[coexist] WhatsApp bulk import threw — batch lost",
        )
        throw error
      }

      importedContacts += batchResult.importedContacts
      importedMessages += batchResult.importedMessages
      skipped += batchResult.skippedMessages + batchResult.skippedContacts
      failed += batchResult.failedMessages
      totalRows += stagedRows.length

      // Surface non-throw failure (e.g. workspace cap hit) so currentError is
      // populated even when bulkImportHistorical returns failedMessages > 0
      // without raising. Otherwise UI shows failedCount=N with empty error.
      if (batchResult.failureReason) {
        finalError = `batch ${batchNumber}: ${batchResult.failureReason}`
      }

      // Apply post-batch patches (media follow-ups, edits, revokes). These
      // target rows already inserted by bulkImportHistorical (or by an earlier
      // batch). Patches that cannot resolve a contactInboxId / messageId are
      // silently dropped — Meta sometimes delivers a media follow-up before
      // the history insert, and the next chunk picks it up.
      const patchResult = await applyPostBatchPatches({
        workspaceId: integration.workspaceId,
        inboxId: integration.inboxId,
        mediaFollowUps: batchMediaFollowUps,
        edits: batchEdits,
        revokes: batchRevokes,
      })

      // Collect Attachment IDs from both phases: inline (bulkImportHistorical)
      // and post-batch (media follow-ups + edit-with-media). Enqueue each as
      // a separate download job — handler is idempotent + jobId-dedup'd.
      const attachmentIdsToDownload = [
        ...batchResult.insertedAttachmentIds,
        ...patchResult.insertedAttachmentIds,
      ]
      if (attachmentIdsToDownload.length > 0) {
        try {
          await integrationQueue.addBulk(
            attachmentIdsToDownload.map((attachmentId) => ({
              name: IntegrationJobAction.coexistAttachmentDownload,
              data: {
                type: IntegrationJobAction.coexistAttachmentDownload,
                data: {
                  attachmentId,
                  workspaceId: integration.workspaceId,
                  channel: "whatsapp" as const,
                  integrationId: integration.id,
                },
              },
              opts: {
                jobId: `att-${attachmentId}`,
                attempts: 5,
                backoff: { type: "exponential", delay: 30_000 },
                removeOnComplete: true,
                removeOnFail: { count: 100 },
              },
            })),
          )
        } catch (error) {
          logger.error(
            { error, runId, count: attachmentIdsToDownload.length },
            "[coexist] WhatsApp attachment download enqueue failed — bytes left as pending",
          )
        }
      }

      // Mark ALL rows in this batch processed — bulk pipeline was atomic.
      // Cap-rejected contacts also count as "processed" (deterministic skip,
      // re-processing won't recover them).
      await db
        .update(whatsappCoexistStagingModel)
        .set({ processedAt: new Date() })
        .where(
          inArray(
            whatsappCoexistStagingModel.id,
            stagedRows.map((r) => r.id),
          ),
        )

      await db
        .update(coexistSyncRunModel)
        .set({
          currentScan: totalRows,
          importedContactCount: importedContacts,
          importedMessageCount: importedMessages,
          skippedCount: skipped,
          failedCount: failed,
          currentPageNumber: batchNumber,
          currentStep: `flushing batch ${batchNumber}`,
          currentError: finalError ?? null,
          lastHeartbeatAt: new Date(),
          ...(batchMetadata
            ? {
                lastPhase: batchMetadata.phase,
                lastChunkOrder: batchMetadata.chunkOrder,
                syncProgress: batchMetadata.progress,
              }
            : {}),
        })
        .where(eq(coexistSyncRunModel.id, runId))

      // History-decline short-circuit: user declined chat-history sharing in
      // the WA Business app. Mark integration so UI hides retry CTA, then
      // finish the run as succeeded (no data loss — there is nothing to
      // import) with a sentinel `currentError` for the UI to read.
      if (batchDeclined) {
        await db
          .update(integrationWhatsappModel)
          .set({ historyDeclined: true, updatedAt: new Date() })
          .where(eq(integrationWhatsappModel.id, integration.id))
        finalStatus = "succeeded"
        finalError = "history_declined"
        exhausted = true
        break
      }

      if (stagedRows.length < BATCH_SIZE) {
        exhausted = true
        break
      }
    }

    if (exhausted) {
      // Tail re-check: rows can be staged between the loop's last empty query
      // and now. If we finalized the run as succeeded, those late rows would be
      // orphaned — a buffer-triggered flush finds no live run to claim. Instead
      // keep the run alive and let the existing continuation drain them
      // (coalesced: one continuation, not one job per late webhook).
      const [tailRow] = await db
        .select({ id: whatsappCoexistStagingModel.id })
        .from(whatsappCoexistStagingModel)
        .where(
          and(
            eq(whatsappCoexistStagingModel.phoneNumberId, phoneNumberId),
            isNull(whatsappCoexistStagingModel.processedAt),
          ),
        )
        .limit(1)

      if (tailRow) {
        continueLater = true
      } else if (failed > 0 && (importedMessages > 0 || skipped > 0)) {
        finalStatus = "partial"
      } else if (failed > 0) {
        finalStatus = "failed"
      } else {
        finalStatus = "succeeded"
      }
    }

    // continueLater is set either by the time-budget break at the top of the
    // loop, or by the tail re-check above when late rows were staged after the
    // drain. In both cases finalStatus stays null, so the run is not finalized
    // and a continuation is enqueued to keep draining.
    if (continueLater) {
      try {
        await integrationQueue.add(
          IntegrationJobAction.coexistWhatsappFlush,
          {
            type: IntegrationJobAction.coexistWhatsappFlush,
            data: { runId, phoneNumberId },
          },
          {
            jobId: `coexist-run-${runId}-${attempts}-page-${batchNumber + 1}`,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 100 },
          },
        )
        logger.info(
          { runId, batchNumber, phoneNumberId },
          "[coexist] WhatsApp flush chunk done — continuation enqueued",
        )
      } catch (error) {
        logger.error(
          { error, runId },
          "[coexist] WhatsApp continuation enqueue failed — fallback to scheduler",
        )
        await db
          .update(coexistSyncRunModel)
          .set({
            status: "init",
            lastHeartbeatAt: new Date(),
          })
          .where(eq(coexistSyncRunModel.id, runId))
      }
    }
  } catch (error) {
    finalStatus = "failed"
    finalError =
      error instanceof Error ? error.message : "Unknown error during flush"
    logger.error(error, "[coexist] WhatsApp flush encountered fatal error")
  } finally {
    if (finalStatus !== null) {
      await db
        .update(coexistSyncRunModel)
        .set({
          status: finalStatus,
          finishedAt: new Date(),
          lastHeartbeatAt: new Date(),
          currentScan: totalRows,
          currentStep: "done",
          importedContactCount: importedContacts,
          importedMessageCount: importedMessages,
          skippedCount: skipped,
          failedCount: failed,
          currentError: finalError ?? null,
        })
        .where(eq(coexistSyncRunModel.id, runId))
    }
  }

  logger.info(
    {
      phoneNumberId,
      importedContacts,
      importedMessages,
      skipped,
      failed,
      rows: totalRows,
      runId,
      finalStatus,
      continued: continueLater,
    },
    "[coexist] WhatsApp flush chunk complete",
  )
}
