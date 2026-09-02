// biome-ignore-all lint/suspicious/noBitwiseOperators: bit-packing 63-bit snowflake IDs

import {
  contactInboxService,
  conversationService,
  messageCleanupService,
  workspaceUsageService,
} from "@chatbotx.io/business"
import { buildContactInboxIdentityWhere } from "@chatbotx.io/business/contact-inbox"
import {
  and,
  type DatabaseClient,
  db,
  describeDatabaseError,
  eq,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import { contactSources } from "@chatbotx.io/database/partials"
import type {
  BulkCreateAttachmentInput,
  CreateMessageInput,
  IMessageRepository,
} from "@chatbotx.io/database/repositories"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import type { InboxModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { emitContactCreated } from "@chatbotx.io/events"
import type { IncomingContact, IncomingMessage } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import pLimit from "p-limit"
import { logger } from "../../../lib/logger"

// ---------- Coexist time-derived Message IDs ----------
// Layout mirrors `@chatbotx.io/utils` `createId()` shift so coexist IDs share
// the same numeric magnitude/length as live snowflakes:
//   high → low: [ 53 bits ms since epoch ][ 14 bits disambiguator ]
//   ts_shift = 14   (identical to uuniq layout)
// The high 53 bits are a pure function of `createdAt`, so `ORDER BY id` ≡
// `ORDER BY createdAt` for historically-imported rows.
//
// The low 14 bits disambiguate messages that share the same createdAt-second.
// They are derived from a stable hash of `(contactInboxId, sourceId)` — NOT the
// run — so the id is a pure function of (createdAt, contactInboxId, sourceId).
// Including `contactInboxId` is essential: the DB PK is (id, createdAt) but the
// upsert arbiter is (contactInboxId, sourceId, createdAt). If the id ignored
// contactInboxId, importing the SAME message into a DIFFERENT ContactInbox
// (e.g. after a disconnect/reconnect mints a new ContactInbox) would re-mint
// the old id, which the arbiter can't catch (different contactInboxId) → PK
// collision. Keying the disambiguator on contactInboxId too keeps ids
// idempotent per (contactInboxId, sourceId, createdAt) AND unique across
// ContactInboxes. Two distinct messages only clash on a rare 14-bit hash
// collision, resolved by the per-import probe below and the bulkCreate PK retry.

const COEXIST_EPOCH_MS = new Date("2004-02-01").getTime()
const COEXIST_TS_BITS = 53n
const COEXIST_DISAMBIG_BITS = 14n
const COEXIST_TS_SHIFT = COEXIST_DISAMBIG_BITS
const COEXIST_DISAMBIG_MASK = (1n << COEXIST_DISAMBIG_BITS) - 1n
const COEXIST_MAX_TS = 1n << COEXIST_TS_BITS
const COEXIST_DISAMBIG_SPACE = 1n << COEXIST_DISAMBIG_BITS

export type HistoricalIdFactory = (
  date: Date,
  sourceId: string,
  contactInboxId: string,
) => string

// FNV-1a over the disambiguator key, folded into the 14-bit space. Pure and
// deterministic: the same key always maps to the same starting slot.
const hashKey = (key: string): bigint => {
  let hash = 2_166_136_261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return BigInt(hash >>> 0) & COEXIST_DISAMBIG_MASK
}

export const createHistoricalIdFactory = (): HistoricalIdFactory => {
  // Ids minted in THIS import. Lets distinct messages that hash to the same
  // disambiguator at the same second probe forward to a free slot instead of
  // emitting a duplicate (id, createdAt) within one batch. Also lets a retry
  // (re-calling for the same message) advance past the colliding slot.
  const used = new Set<bigint>()

  return (date: Date, sourceId: string, contactInboxId: string): string => {
    const baseTs = BigInt(date.getTime() - COEXIST_EPOCH_MS)
    if (baseTs < 0n || baseTs >= COEXIST_MAX_TS) {
      throw new Error(
        `createHistoricalIdFactory: ${date.toISOString()} out of range`,
      )
    }
    // Key on (contactInboxId, sourceId) so the same message in a different
    // ContactInbox mints a different id — see the layout note above.
    const start = hashKey(`${contactInboxId}:${sourceId}`)
    let ts = baseTs
    while (ts < COEXIST_MAX_TS) {
      for (let offset = 0n; offset < COEXIST_DISAMBIG_SPACE; offset++) {
        const disambiguator = (start + offset) & COEXIST_DISAMBIG_MASK
        const id = (ts << COEXIST_TS_SHIFT) | disambiguator
        if (!used.has(id)) {
          used.add(id)
          return id.toString()
        }
      }
      ts += 1n
    }
    throw new Error(
      `createHistoricalIdFactory: exhausted disambiguator space at ${date.toISOString()}`,
    )
  }
}

export const decodeHistoricalId = (
  id: string,
): { timestampMs: number; disambiguator: number } => {
  const v = BigInt(id)
  return {
    timestampMs: Number(v >> COEXIST_TS_SHIFT) + COEXIST_EPOCH_MS,
    disambiguator: Number(v & COEXIST_DISAMBIG_MASK),
  }
}

/** Keep the numerically larger of two message-id strings (null-safe). The
 *  single "newest id wins" rule shared by `maxMessageId`, the per-conversation
 *  merge below, and messenger-sync's per-page fold. */
export const maxNumericId = (
  a: string | null,
  b: string | null,
): string | null => {
  if (a === null) {
    return b
  }
  if (b === null) {
    return a
  }
  return BigInt(a) < BigInt(b) ? b : a
}

/** Ids are time-ordered snowflakes (ORDER BY id ≡ ORDER BY createdAt), so the
 *  max id over the rows bulkCreate actually inserted IS the newest
 *  sync-inserted message — direction-agnostic (incoming and outgoing both
 *  count). Duplicates skipped by onConflictDoNothing are absent from
 *  insertedRows and never drive the marker. */
const maxMessageId = (rows: ReadonlyArray<{ id: string }>): string | null =>
  rows.reduce<string | null>((max, row) => maxNumericId(max, row.id), null)

const isUniqueMessagePkViolation = (err: unknown): boolean => {
  // Drizzle wraps the pg error, so code/constraint live on `.cause` (sometimes
  // nested). Walk the cause chain. pg exposes the constraint as `constraint`
  // (older shims used `constraint_name`). TimescaleDB reports the chunk-prefixed
  // name like "17_17_Message_pkey", so match by suffix rather than equality.
  let current: unknown = err
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current !== "object") {
      return false
    }
    const e = current as {
      code?: string
      constraint?: string
      constraint_name?: string
      cause?: unknown
    }
    const constraint = e.constraint ?? e.constraint_name
    if (e.code === "23505" && constraint?.endsWith("Message_pkey")) {
      return true
    }
    current = e.cause
  }
  return false
}

/**
 * Cap on how many times a single row's id is re-minted while probing past
 * DB-occupied `(id, createdAt)` slots. Each attempt advances the factory's
 * disambiguator; 64 is far beyond any realistic same-second slot occupancy, so
 * exhausting it signals something genuinely wrong and is surfaced loudly.
 */
const MAX_PK_REMINT_ATTEMPTS = 64

/**
 * Insert a single row that PK-collided, re-minting its id until it lands in a
 * free `(id, createdAt)` slot. Each `makeMessageId` call advances the factory's
 * in-process `used` set, so successive attempts probe forward instead of
 * re-emitting the colliding id. Genuine duplicates never reach here — they
 * match the arbiter and are swallowed silently by `bulkCreate`.
 */
const remintRow = async (
  repository: IMessageRepository,
  row: CreateMessageInput,
  makeMessageId: HistoricalIdFactory,
  contactInboxId: string,
  runId: string,
): Promise<{ id: string; sourceId: string | null }[]> => {
  for (let attempt = 0; attempt < MAX_PK_REMINT_ATTEMPTS; attempt++) {
    const reminted: CreateMessageInput = {
      ...row,
      id: makeMessageId(
        row.createdAt as Date,
        row.sourceId ?? "",
        contactInboxId,
      ),
    }
    try {
      return await repository.bulkCreate([reminted])
    } catch (err) {
      if (!isUniqueMessagePkViolation(err)) {
        throw err
      }
      // Still colliding — loop; the next mint advances to another slot.
    }
  }
  logger.error(
    {
      runId,
      sourceId: row.sourceId,
      createdAt: row.createdAt,
      attempts: MAX_PK_REMINT_ATTEMPTS,
    },
    "[coexist] Message PK collision unresolved after re-minting — giving up on row",
  )
  throw new Error(
    `[coexist] Message PK collision unresolved after ${MAX_PK_REMINT_ATTEMPTS} re-mints (sourceId=${row.sourceId})`,
  )
}

/**
 * Converge a batch that is KNOWN to contain at least one PK `(id, createdAt)`
 * collision the repository's arbiter `(contactInboxId, sourceId, createdAt)`
 * does not catch.
 *
 * A PK-thrown row is ALWAYS a distinct message: a genuine re-import matches the
 * arbiter and is swallowed by `onConflictDoNothing`, never throwing. The clash
 * is a rare 14-bit id-hash collision with a row already in the DB — invisible
 * to `makeMessageId`'s in-process `used` set. We isolate the colliders by
 * splitting the batch in halves (a half whose rows are all fine still inserts
 * in one bulk call), and re-mint only the single rows that truly collide. This
 * shifts only the offending rows and provably converges, unlike the previous
 * whole-batch re-mint which just traded one collision for another.
 *
 * Re-minting is safe for idempotency: the stored id no longer equals the
 * deterministic id, but a future re-import is deduped by the arbiter tuple, not
 * the id.
 */
const convergePkCollisions = async (
  repository: IMessageRepository,
  inputs: CreateMessageInput[],
  makeMessageId: HistoricalIdFactory,
  contactInboxId: string,
  runId: string,
): Promise<{ id: string; sourceId: string | null }[]> => {
  if (inputs.length === 1) {
    return await remintRow(
      repository,
      inputs[0],
      makeMessageId,
      contactInboxId,
      runId,
    )
  }

  const mid = Math.floor(inputs.length / 2)
  const halves = [inputs.slice(0, mid), inputs.slice(mid)]
  const out: { id: string; sourceId: string | null }[] = []
  // Sequential, not parallel: all rows share one factory `used` set, so
  // concurrent minting would race on slot assignment.
  for (const half of halves) {
    try {
      out.push(...(await repository.bulkCreate(half)))
    } catch (err) {
      if (!isUniqueMessagePkViolation(err)) {
        throw err
      }
      out.push(
        ...(await convergePkCollisions(
          repository,
          half,
          makeMessageId,
          contactInboxId,
          runId,
        )),
      )
    }
  }
  return out
}

export type HistoricalMessage = IncomingMessage & { createdAt?: Date }

export type ContactImportLink = {
  contactInboxId: string
  contactId: string
  conversationId: string
}

export type BulkImportContactsResult = {
  importedContacts: number
  skippedContacts: number
  /** sourceId → resolved link (existing or newly inserted). */
  contactInboxIds: Map<string, ContactImportLink>
  /** Non-throw failure (e.g. workspace contact cap hit). */
  failureReason?: string
}

export type BulkImportMessagesResult = {
  importedMessages: number
  skippedMessages: number
  /** Attachment row IDs inserted alongside imported messages. Empty when no
   *  message in this call carried an `attachments[]` payload. Callers enqueue
   *  one `coexistAttachmentDownload` job per ID to mirror bytes to S3. */
  insertedAttachmentIds: string[]
  /** Newest API-provided message createdAt in this call (null when none).
   *  Returned so a batching caller can defer the per-row ContactInbox/
   *  Conversation activity bumps and apply them in a single statement per table
   *  for the whole bulk. */
  newestMessageAt: Date | null
  /** Oldest API-provided message createdAt in this call (null when none).
   *  Used only for ContactInbox.firstInteractionAt. */
  oldestMessageAt: Date | null
  /** Newest API-provided incoming message createdAt in this call (null when
   *  none). Used only for ContactInbox.lastIncomingMessageAt. */
  newestIncomingMessageAt: Date | null
  /** Id of the newest message actually inserted by this call, either
   *  direction; null when nothing was inserted. Computed from ALL
   *  `insertedRows`, independent of `newestMessageAt` — a message inserted
   *  with `fallbackCreatedAt` (invalid/missing API timestamp) still counts
   *  here even though it never counts toward `newestMessageAt`. */
  newestMessageId: string | null
}

/** One contact's activity-timestamp bump, collected by a batching caller.
 *  A whole batch belongs to one workspace — the caller passes `workspaceId`
 *  to `applyCoexistActivityUpdates` instead of repeating it per row. */
export type CoexistActivityUpdate = {
  contactInboxId: string
  contactId: string
  conversationId: string
  /** Null when no message in this update carried a valid API timestamp
   *  (e.g. all inserted with `fallbackCreatedAt`) — the row can still exist
   *  purely to carry `aiMarkerMessageId` for the AI-context marker. */
  newestMessageAt: Date | null
  oldestMessageAt: Date | null
  newestIncomingMessageAt: Date | null
  /** Id of the newest sync-inserted message for this conversation (either
   *  direction). Set by default so the AI ignores synced history; callers
   *  null it out only when the integration opted into letting the AI read
   *  synced history. Null = do not advance the marker. */
  aiMarkerMessageId: string | null
}

type ContactInboxMerge = {
  newestMessageAt: Date
  oldestMessageAt: Date
  newestIncomingMessageAt: Date | null
  contactId: string
}

type ConversationMerge = {
  newestMessageAt: Date | null
  aiMarkerMessageId: string | null
}

/** Fold one update into the per-ContactInbox tracking map. Rows without valid
 *  API timestamps carry nothing for ContactInbox and are skipped. */
const mergeContactInboxUpdate = (
  map: Map<string, ContactInboxMerge>,
  u: CoexistActivityUpdate,
): void => {
  if (u.newestMessageAt === null || u.oldestMessageAt === null) {
    return
  }
  const existing = map.get(u.contactInboxId)
  if (!existing) {
    map.set(u.contactInboxId, {
      contactId: u.contactId,
      newestMessageAt: u.newestMessageAt,
      oldestMessageAt: u.oldestMessageAt,
      newestIncomingMessageAt: u.newestIncomingMessageAt,
    })
    return
  }
  if (existing.newestMessageAt < u.newestMessageAt) {
    existing.newestMessageAt = u.newestMessageAt
  }
  if (existing.oldestMessageAt > u.oldestMessageAt) {
    existing.oldestMessageAt = u.oldestMessageAt
  }
  if (
    u.newestIncomingMessageAt &&
    (!existing.newestIncomingMessageAt ||
      existing.newestIncomingMessageAt < u.newestIncomingMessageAt)
  ) {
    existing.newestIncomingMessageAt = u.newestIncomingMessageAt
  }
}

/** Fold one update into the per-Conversation map: newest timestamp and newest
 *  marker id advance independently of each other. */
const mergeConversationUpdate = (
  map: Map<string, ConversationMerge>,
  u: CoexistActivityUpdate,
): void => {
  const existing = map.get(u.conversationId)
  if (!existing) {
    map.set(u.conversationId, {
      newestMessageAt: u.newestMessageAt,
      aiMarkerMessageId: u.aiMarkerMessageId,
    })
    return
  }
  if (
    u.newestMessageAt &&
    (!existing.newestMessageAt || existing.newestMessageAt < u.newestMessageAt)
  ) {
    existing.newestMessageAt = u.newestMessageAt
  }
  existing.aiMarkerMessageId = maxNumericId(
    existing.aiMarkerMessageId,
    u.aiMarkerMessageId,
  )
}

/**
 * Bump activity timestamps (and the AI-context marker, when the caller set
 * `aiMarkerMessageId` on its rows) for a whole bulk in ONE statement per
 * table (not two+ queries per contact in the import loop). In coexist these
 * columns must mirror the newest API-provided message time, not the sync
 * worker's wall clock:
 *
 *   - ContactInbox.firstInteractionAt: set once from the oldest message.
 *   - ContactInbox.lastMessageAt: set from the newest message.
 *   - ContactInbox.lastIncomingMessageAt: advance from the newest incoming
 *     message only; outgoing history must not move this field.
 *   - Conversation.lastActivityAt: set from the newest message.
 *   - Conversation.aiContextLastMessageId: advance to `aiMarkerMessageId`
 *     (rows where the caller left it null leave the marker untouched).
 *
 * Rows with a null `newestMessageAt`/`oldestMessageAt` (every message in that
 * update used `fallbackCreatedAt`) skip the ContactInbox tracking bump — a
 * row can exist purely to carry `aiMarkerMessageId` — but still reach the
 * Conversation update so the marker still advances.
 *
 * The conversation UPDATE routes through `conversationService` (not raw
 * `db.execute`) so it gets the same advance-only, NULL-guarded semantics for
 * both columns plus the required cache invalidation. Failures must
 * propagate: otherwise a coexist run can be marked succeeded while these
 * denormalized activity columns remain null or stuck at row-creation time.
 */
export const applyCoexistActivityUpdates = async (
  updates: CoexistActivityUpdate[],
  options: { workspaceId: string },
): Promise<void> => {
  if (updates.length === 0) {
    return
  }

  // Dedup by id, keeping the newest ts (and newest marker id). ids are
  // unique per contact within a batch, but a resumed/overlapping batch could
  // repeat one — and a duplicate join key in VALUES would update the row
  // twice with no defined winner.
  const newestByContactInbox = new Map<string, ContactInboxMerge>()
  const newestByConversation = new Map<string, ConversationMerge>()
  for (const u of updates) {
    mergeContactInboxUpdate(newestByContactInbox, u)
    mergeConversationUpdate(newestByConversation, u)
  }

  // The two writes touch disjoint tables from disjoint maps — run in parallel.
  await Promise.all([
    newestByContactInbox.size > 0
      ? contactInboxService.bulkUpdateTracking({
          rows: [...newestByContactInbox.entries()].map(([id, update]) => ({
            contactInboxId: id,
            contactId: update.contactId,
            workspaceId: options.workspaceId,
            firstInteractionAt: update.oldestMessageAt,
            lastMessageAt: update.newestMessageAt,
            lastIncomingMessageAt: update.newestIncomingMessageAt,
          })),
        })
      : Promise.resolve(),
    newestByConversation.size > 0
      ? conversationService.bulkAdvanceActivityAndAiContextMarker({
          workspaceId: options.workspaceId,
          rows: [...newestByConversation.entries()].map(
            ([conversationId, v]) => ({
              conversationId,
              newestMessageAt: v.newestMessageAt,
              aiMarkerMessageId: v.aiMarkerMessageId,
            }),
          ),
        })
      : Promise.resolve(),
  ])
}

const isValidDate = (date: Date | undefined): date is Date =>
  date instanceof Date && Number.isFinite(date.getTime())

/**
 * Legacy combined contact+messages entry used by WhatsApp coexist flush. New
 * Messenger sync path calls `bulkImportContacts` and `bulkImportMessages`
 * independently.
 */
export type HistoricalContactMessages = {
  contact: IncomingContact
  messages: HistoricalMessage[]
}

export type BulkImportHistoricalResult = {
  importedContacts: number
  importedMessages: number
  skippedContacts: number
  skippedMessages: number
  failedMessages: number
  contactInboxIds: Map<string, string>
  /** Aggregated Attachment row IDs across every per-contact insert in the
   *  batch. Caller drives the post-commit download enqueue. */
  insertedAttachmentIds: string[]
  failureReason?: string
}

/**
 * Phase 1 of Coexist historical sync: dedup contacts by sourceId, resolve
 * existing ContactInbox rows, and bulk-insert new Contact/ContactInbox/
 * Conversation rows. Bulk imports create contact records only; MAC is counted
 * later when a real interaction occurs.
 *
 * Race-safe via `onConflictDoNothing` + post-insert re-select for losers, with
 * orphan Contact cleanup. Idempotent — re-running with the same batch returns
 * the existing links without creating duplicates.
 *
 * Returns one `ContactImportLink` per dedup'd sourceId (existing + newly
 * created). Callers use this map to dispatch downstream avatar / message
 * fetches without an additional DB lookup.
 */
type ContactInboxIdentityRow = {
  id: string
  sourceId: string
  sourceUserId: string | null
  contactId: string
}

const rowsBySourceUserId = <T extends { sourceUserId: string | null }>(
  rows: readonly T[],
): Map<string, T> =>
  new Map(
    rows.flatMap((row) =>
      row.sourceUserId === null ? [] : [[row.sourceUserId, row] as const],
    ),
  )

/**
 * Resolves raced entries whose ContactInbox insert was skipped by the partial
 * (inboxId, sourceUserId) unique index: finds the winner row owning each
 * entry's scoped user id, keyed by the entry's own import sourceId so the
 * caller can alias the import key to the winner's link.
 */
const resolveScopedIdRaceWinners = async (props: {
  tx: DatabaseClient
  inboxId: string
  racedEntries: ReadonlyArray<readonly [string, string]>
}): Promise<Map<string, ContactInboxIdentityRow>> => {
  const { tx, inboxId, racedEntries } = props
  if (racedEntries.length === 0) {
    return new Map()
  }
  const winners = await tx
    .select({
      id: contactInboxModel.id,
      sourceId: contactInboxModel.sourceId,
      sourceUserId: contactInboxModel.sourceUserId,
      contactId: contactInboxModel.contactId,
    })
    .from(contactInboxModel)
    .where(
      and(
        eq(contactInboxModel.inboxId, inboxId),
        inArray(
          contactInboxModel.sourceUserId,
          racedEntries.map(([, scopedId]) => scopedId),
        ),
      ),
    )
  const winnerByScopedId = rowsBySourceUserId(winners)
  const aliases = new Map<string, ContactInboxIdentityRow>()
  for (const [entrySourceId, scopedId] of racedEntries) {
    const winner = winnerByScopedId.get(scopedId)
    if (winner) {
      aliases.set(entrySourceId, winner)
    }
  }
  return aliases
}

export const bulkImportContacts = async (props: {
  inbox: InboxModel
  workspaceId: string
  contacts: IncomingContact[]
}): Promise<BulkImportContactsResult> => {
  const { inbox, workspaceId, contacts } = props

  const empty: BulkImportContactsResult = {
    importedContacts: 0,
    skippedContacts: 0,
    contactInboxIds: new Map(),
  }
  if (contacts.length === 0) {
    return empty
  }

  // Dedup by sourceId — prefer first non-null field across duplicates.
  const dedup = new Map<string, IncomingContact>()
  for (const entry of contacts) {
    const key = entry.sourceId
    if (!key) {
      continue
    }
    const existing = dedup.get(key)
    if (!existing) {
      dedup.set(key, { ...entry })
      continue
    }
    dedup.set(key, {
      sourceId: existing.sourceId,
      phoneNumber: existing.phoneNumber ?? entry.phoneNumber,
      phoneNumberId: existing.phoneNumberId ?? entry.phoneNumberId,
      firstName: existing.firstName ?? entry.firstName,
      lastName: existing.lastName ?? entry.lastName,
      email: existing.email ?? entry.email,
      avatar: existing.avatar ?? entry.avatar,
      gender: existing.gender ?? entry.gender,
      sourceUserId: existing.sourceUserId ?? entry.sourceUserId,
      sourceUsername: existing.sourceUsername ?? entry.sourceUsername,
    })
  }

  if (dedup.size === 0) {
    return empty
  }

  const sourceIds = [...dedup.keys()]
  const newContactCreatedEvents: Array<{
    workspaceId: string
    contactId: string
    contactInboxId: string
    sourceId: string
    firstName?: string
    phoneNumber?: string
    email?: string
    channel: string
    source: string
    createdAt: Date
  }> = []

  let importedContacts = 0
  const skippedContacts = 0
  const failureReason: string | undefined = undefined
  const contactInboxIds = new Map<string, ContactImportLink>()

  // A thread's scoped user id (e.g. a WhatsApp BSUID) may already belong to a
  // row in this inbox under a different sourceId. Matching on it up front
  // resolves the thread to that row instead of attempting an insert that
  // would violate the partial unique index (inboxId, sourceUserId).
  const sourceUserIds = [...dedup.values()].flatMap((entry) =>
    entry.sourceUserId ? [entry.sourceUserId] : [],
  )

  await db.transaction(async (tx) => {
    // 1. Find existing ContactInbox rows — by sourceId or scoped user id.
    const existingRows = await tx
      .select({
        id: contactInboxModel.id,
        sourceId: contactInboxModel.sourceId,
        sourceUserId: contactInboxModel.sourceUserId,
        contactId: contactInboxModel.contactId,
      })
      .from(contactInboxModel)
      .where(
        buildContactInboxIdentityWhere({
          inboxId: inbox.id,
          sourceIds,
          sourceUserIds,
        }),
      )

    const resolved = new Map<string, ContactImportLink>()
    const existingContactIds = new Set<string>()

    for (const row of existingRows) {
      existingContactIds.add(row.contactId)
      resolved.set(row.sourceId, {
        contactInboxId: row.id,
        contactId: row.contactId,
        conversationId: "",
      })
    }

    const existingBySourceUserId = rowsBySourceUserId(existingRows)
    for (const [sourceId, entry] of dedup) {
      if (resolved.has(sourceId) || !entry.sourceUserId) {
        continue
      }
      const row = existingBySourceUserId.get(entry.sourceUserId)
      if (!row) {
        continue
      }
      existingContactIds.add(row.contactId)
      resolved.set(sourceId, {
        contactInboxId: row.id,
        contactId: row.contactId,
        conversationId: "",
      })
    }

    // Resolve conversation ids for existing contacts. Heal orphans (existing
    // ContactInbox + Contact but missing Conversation) by inserting one now,
    // so downstream callers never receive an empty conversationId.
    if (existingContactIds.size > 0) {
      const conversations = await tx
        .select({
          id: conversationModel.id,
          contactId: conversationModel.contactId,
        })
        .from(conversationModel)
        .where(inArray(conversationModel.contactId, [...existingContactIds]))
      const convByContact = new Map(
        conversations.map((c) => [c.contactId, c.id]),
      )

      const orphanContactIds = [...existingContactIds].filter(
        (cid) => !convByContact.has(cid),
      )
      if (orphanContactIds.length > 0) {
        await tx
          .insert(conversationModel)
          .values(
            orphanContactIds.map((cid) => ({
              id: createId(),
              workspaceId,
              contactId: cid,
            })),
          )
          .onConflictDoNothing()
        const healed = await tx
          .select({
            id: conversationModel.id,
            contactId: conversationModel.contactId,
          })
          .from(conversationModel)
          .where(inArray(conversationModel.contactId, orphanContactIds))
        for (const c of healed) {
          convByContact.set(c.contactId, c.id)
        }
      }

      for (const link of resolved.values()) {
        const cid = convByContact.get(link.contactId)
        if (cid) {
          link.conversationId = cid
        }
      }
    }

    const newEntries = [...dedup.entries()].filter(
      ([sourceId]) => !resolved.has(sourceId),
    )
    const acceptedNew = newEntries

    // 2. Insert Contact + ContactInbox + Conversation for acceptedNew.
    if (acceptedNew.length > 0) {
      const contactRows = acceptedNew.map(([, entry]) => ({
        id: createId(),
        workspaceId,
        firstName: entry.firstName,
        lastName: entry.lastName,
        email: entry.email,
        phoneNumber: entry.phoneNumber,
        avatar: entry.avatar,
      }))

      await tx.insert(contactModel).values(contactRows)

      const contactInboxRows = acceptedNew.map(([sourceId, entry], i) => ({
        id: createId(),
        inboxId: inbox.id,
        contactId: contactRows[i]?.id,
        originalContactId: contactRows[i]?.id,
        source: contactSources.enum.inboundMessage,
        sourceId,
        sourceUserId: entry.sourceUserId ?? null,
        sourceUsername: entry.sourceUsername ?? null,
        channel: inbox.channel,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      const conversationRows = acceptedNew.map((_entry, i) => ({
        id: createId(),
        workspaceId,
        contactId: contactRows[i]?.id,
      }))

      // Targetless DO NOTHING: a concurrent import can win EITHER identity
      // index — (inboxId, sourceId) or the partial (inboxId, sourceUserId) —
      // and a targeted clause would let the second one abort the whole batch.
      const insertedInboxes = await tx
        .insert(contactInboxModel)
        .values(contactInboxRows)
        .onConflictDoNothing()
        .returning({
          id: contactInboxModel.id,
          sourceId: contactInboxModel.sourceId,
          contactId: contactInboxModel.contactId,
        })

      const insertedSourceIds = new Set(insertedInboxes.map((r) => r.sourceId))

      // Race recovery — any acceptedNew sourceId not inserted lost to a
      // concurrent insert; re-SELECT winners + delete pre-allocated orphans.
      const racedSourceIds = acceptedNew
        .map(([sourceId]) => sourceId)
        .filter((s) => !insertedSourceIds.has(s))

      // Maps a raced entry's import key to the winner row that claimed its
      // scoped user id under a DIFFERENT sourceId — the final link mapping is
      // keyed by row.sourceId, so these aliases are re-keyed at the end.
      let scopedWinnerAliases = new Map<string, ContactInboxIdentityRow>()

      if (racedSourceIds.length > 0) {
        const winners = await tx
          .select({
            id: contactInboxModel.id,
            sourceId: contactInboxModel.sourceId,
            contactId: contactInboxModel.contactId,
          })
          .from(contactInboxModel)
          .where(
            and(
              eq(contactInboxModel.inboxId, inbox.id),
              inArray(contactInboxModel.sourceId, racedSourceIds),
            ),
          )
        for (const w of winners) {
          insertedInboxes.push(w)
          insertedSourceIds.add(w.sourceId)
        }

        // A raced row skipped on the scoped-user-id index has no winner under
        // its own sourceId — resolve it through the row owning that scoped id.
        scopedWinnerAliases = await resolveScopedIdRaceWinners({
          tx,
          inboxId: inbox.id,
          racedEntries: racedSourceIds.flatMap((sourceId) => {
            if (insertedSourceIds.has(sourceId)) {
              return []
            }
            const scopedId = dedup.get(sourceId)?.sourceUserId
            return scopedId ? [[sourceId, scopedId] as const] : []
          }),
        })
        for (const winner of scopedWinnerAliases.values()) {
          insertedInboxes.push({
            id: winner.id,
            sourceId: winner.sourceId,
            contactId: winner.contactId,
          })
        }

        const racedSet = new Set(racedSourceIds)
        const orphanIds: string[] = []
        for (let i = 0; i < acceptedNew.length; i++) {
          const sourceId = acceptedNew[i]?.[0]
          const contactId = contactRows[i]?.id
          if (sourceId && contactId && racedSet.has(sourceId)) {
            orphanIds.push(contactId)
          }
        }
        if (orphanIds.length > 0) {
          await tx
            .delete(contactModel)
            .where(inArray(contactModel.id, orphanIds))
        }
      }

      // Re-created contacts keep their history: cancel any pending message
      // cleanup recorded when contacts with these inbox identities were deleted.
      await messageCleanupService.cancelByInboxSource({
        inboxId: inbox.id,
        sourceIds: insertedInboxes.map((r) => r.sourceId),
        tx,
      })

      const trulyNew = acceptedNew.length - racedSourceIds.length
      importedContacts = trulyNew

      const racedSet2 = new Set(racedSourceIds)
      const conversationsToInsert = conversationRows.filter(
        (_row, i) => !racedSet2.has(acceptedNew[i]?.[0]),
      )
      if (conversationsToInsert.length > 0) {
        await tx
          .insert(conversationModel)
          .values(conversationsToInsert)
          .onConflictDoNothing()
      }

      // Resolve conversation ids for everything just inserted (or raced).
      const acceptedContactIds = insertedInboxes.map((r) => r.contactId)
      const newConversations = await tx
        .select({
          id: conversationModel.id,
          contactId: conversationModel.contactId,
        })
        .from(conversationModel)
        .where(inArray(conversationModel.contactId, acceptedContactIds))
      const convByContactNew = new Map(
        newConversations.map((c) => [c.contactId, c.id]),
      )

      for (const inboxRow of insertedInboxes) {
        const convId = convByContactNew.get(inboxRow.contactId)
        if (!convId) {
          continue
        }
        resolved.set(inboxRow.sourceId, {
          contactInboxId: inboxRow.id,
          contactId: inboxRow.contactId,
          conversationId: convId,
        })

        const entry = dedup.get(inboxRow.sourceId)
        if (entry) {
          newContactCreatedEvents.push({
            workspaceId,
            contactId: inboxRow.contactId,
            contactInboxId: inboxRow.id,
            sourceId: inboxRow.sourceId,
            firstName: entry.firstName,
            phoneNumber: entry.phoneNumber,
            email: entry.email,
            channel: inbox.channel,
            source: contactSources.enum.inboundMessage,
            createdAt: new Date(),
          })
        }
      }

      // Scoped-id winners resolve under their own sourceId above; alias the
      // raced entry's import key to the same link so downstream message
      // imports keyed by the entry's sourceId still find their contact.
      for (const [entrySourceId, winner] of scopedWinnerAliases) {
        const link = resolved.get(winner.sourceId)
        if (link) {
          resolved.set(entrySourceId, link)
        }
      }
    }

    for (const [sourceId, link] of resolved) {
      contactInboxIds.set(sourceId, link)
    }
  })

  // Post-commit side effects.
  for (const ev of newContactCreatedEvents) {
    emitContactCreated(
      ev.workspaceId,
      ev.contactId,
      ev.firstName,
      ev.phoneNumber,
      ev.email,
      ev.contactInboxId,
    ).catch((error) => {
      logger.error(error, "[coexist] Failed to emit contactCreated event")
    })

    emit("analytics:dashboard", {
      eventType: "contact:created",
      workspaceId: ev.workspaceId,
      contactId: ev.contactInboxId,
      occurredAt: ev.createdAt,
      source: ev.source,
      sourceId: ev.sourceId,
      channel: ev.channel,
      metadata: {
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "bulkImportContacts",
          triggerType: "contact_created",
        },
      },
    })?.catch((error) => {
      logger.error(error, "[coexist] Failed to emit contact:created")
    })
  }

  // Info-only workspace usage for newly-created contacts. Coexist is a passive
  // historical backfill and does not consume billing quota.
  if (importedContacts > 0) {
    await workspaceUsageService
      .increment(workspaceId, "contacts", importedContacts)
      .catch((err) => {
        logger.warn(
          { err, workspaceId },
          "workspace usage contact increment failed",
        )
      })
  }

  return {
    importedContacts,
    skippedContacts,
    contactInboxIds,
    failureReason,
  }
}

/**
 * Phase 2 of Coexist historical sync: bulk-insert messages for one resolved
 * Contact/ContactInbox/Conversation triple. Idempotent via the
 * (contactInboxId, sourceId) unique constraint — retries never duplicate rows.
 *
 * Chunks INSERTs at 1000 rows to stay under the Postgres 65535-param limit.
 * On a Message PK collision (rare sourceId-hash clash at the same second),
 * regenerates IDs from the factory (which probes to a free slot) and retries.
 *
 * When `contactEnrichment` is provided (phone/email discovered while scanning
 * message bodies), COALESCE-fills the parent Contact row in the same tx so
 * downstream UI sees the enrichment atomically with the new messages.
 */
export const bulkImportMessages = async (props: {
  workspaceId: string
  runId: string
  contactInboxId: string
  contactId: string
  conversationId: string
  messages: HistoricalMessage[]
  contactEnrichment?: { phoneNumber?: string; email?: string }
  /**
   * Optional shared ID factory. Phase 2 of Messenger sync creates ONE factory
   * per run and passes it to every per-conv `bulkImportMessages` call so the
   * seq counter is shared across convs — without this, two messages from
   * different convs that share a `created_time` (sub-second resolution from
   * Graph) would emit the same ID and hit the unique PK retry path.
   */
  idFactory?: HistoricalIdFactory
}): Promise<BulkImportMessagesResult> => {
  const {
    workspaceId,
    runId,
    contactInboxId,
    contactId,
    conversationId,
    messages,
    contactEnrichment,
    idFactory,
  } = props

  const empty: BulkImportMessagesResult = {
    importedMessages: 0,
    skippedMessages: 0,
    insertedAttachmentIds: [],
    newestMessageAt: null,
    oldestMessageAt: null,
    newestIncomingMessageAt: null,
    newestMessageId: null,
  }

  const hasEnrichment =
    contactEnrichment != null &&
    Boolean(contactEnrichment.phoneNumber || contactEnrichment.email)

  if (messages.length === 0 && !hasEnrichment) {
    return empty
  }

  const makeMessageId = idFactory ?? createHistoricalIdFactory()
  const insertedAttachmentIds: string[] = []

  const messagesWithApiTime = messages.filter(
    (msg): msg is HistoricalMessage & { createdAt: Date } =>
      isValidDate(msg.createdAt),
  )

  // Map message.sourceId → its attachments[] so post-insert we can resolve
  // each inserted Message row to the right Attachment payload.
  const attachmentsBySourceId = new Map<
    string,
    NonNullable<IncomingMessage["attachments"]>
  >()
  for (const msg of messages) {
    if (msg.attachments && msg.attachments.length > 0) {
      attachmentsBySourceId.set(msg.sourceId, msg.attachments)
    }
  }

  // Build message inputs with deterministic snowflake IDs.
  const fallbackCreatedAt = new Date()
  const messageInputs: CreateMessageInput[] = messages.map((msg) => {
    const isOutgoing = msg.messageType === "outgoing"
    const createdAt = isValidDate(msg.createdAt)
      ? msg.createdAt
      : fallbackCreatedAt
    return {
      id: makeMessageId(createdAt, msg.sourceId, contactInboxId),
      conversationId,
      contactInboxId,
      senderType: isOutgoing ? "user" : "contact",
      workspaceId,
      sourceId: msg.sourceId,
      senderId: isOutgoing ? null : contactId,
      messageType: msg.messageType,
      text: msg.text,
      contentType: msg.contentType,
      contentAttributes: msg.contentAttributes,
      createdAt,
    }
  })

  // Insert messages via repository — always shard-aware (ShardedMessageRepository).
  // A PK `(id, createdAt)` collision (a rare 14-bit id-hash clash with a row
  // already in the DB) is NOT caught by bulkCreate's arbiter onConflictDoNothing
  // on (contactInboxId, sourceId, createdAt), so it surfaces as 23505. It is
  // resolved by `remintingBulkInsert`, which re-mints ONLY the colliding rows
  // until they find a free slot; genuine duplicates are still swallowed by the
  // arbiter.
  //
  // Atomicity trade-off: bulkCreate runs outside any transaction wrapping the
  // surrounding conversation/contactInbox updates. A crash mid-batch leaves
  // partial rows in the message table; re-running the import is safe because
  // onConflictDoNothing deduplicates by (contactInboxId, sourceId[, createdAt]).
  // Full transactional atomicity would require cross-shard coordination and is
  // explicitly not supported here.
  let insertedRows: { id: string; sourceId: string | null }[] = []
  let repository: IMessageRepository | null = null
  if (messageInputs.length > 0) {
    repository = await createMessageRepository()
    try {
      insertedRows = await repository.bulkCreate(messageInputs)
    } catch (err) {
      // A non-PK failure is a real error — surface the exact constraint/detail
      // and rethrow.
      if (!isUniqueMessagePkViolation(err)) {
        logger.error(
          {
            runId,
            total: messageInputs.length,
            dbCause: describeDatabaseError(err),
            sampleIds: messageInputs.slice(0, 5).map((m) => m.id),
          },
          "[coexist] Message bulkCreate failed",
        )
        throw err
      }
      // A PK collision is an anticipated, self-healing condition. Converge by
      // re-minting only the colliding rows (see remintingBulkInsert) instead of
      // reshuffling the whole batch — the latter just traded one collision for
      // another and never converged.
      logger.warn(
        {
          runId,
          total: messageInputs.length,
          dbCause: describeDatabaseError(err),
        },
        "[coexist] Message PK collision — re-minting colliding rows and retrying",
      )
      insertedRows = await convergePkCollisions(
        repository,
        messageInputs,
        makeMessageId,
        contactInboxId,
        runId,
      )
    }
  }

  const importedMessages = insertedRows.length
  const skippedMessages = messages.length - importedMessages

  const insertedMessageBySourceId = new Map<string, string>()
  for (const row of insertedRows) {
    if (row.sourceId) {
      insertedMessageBySourceId.set(row.sourceId, row.id)
    }
  }

  // Build messageCreatedAt lookup so attachments can be routed to the correct
  // DB (shard requires messageCreatedAt as partition key; main DB ignores it).
  const messageCreatedAtBySourceId = new Map<string, Date>()
  for (const input of messageInputs) {
    if (input.sourceId) {
      messageCreatedAtBySourceId.set(input.sourceId, input.createdAt as Date)
    }
  }

  // Contact enrichment in its own main-DB transaction.
  if (hasEnrichment && contactEnrichment) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE "Contact" SET
          "phoneNumber" = COALESCE("phoneNumber", ${contactEnrichment.phoneNumber ?? null}::text),
          "email"       = COALESCE("email",       ${contactEnrichment.email ?? null}::text)
        WHERE "id" = ${contactId}
          AND (
            (${contactEnrichment.phoneNumber ?? null}::text IS NOT NULL AND "phoneNumber" IS NULL)
            OR (${contactEnrichment.email ?? null}::text IS NOT NULL AND "email" IS NULL)
          )
      `)
    })
  }

  // Insert Attachment rows for newly-inserted messages only via repository so
  // they land in the same DB as the messages. Previously these were inserted
  // via a direct tx.insert(), which broke when Message rows lived in a shard.
  if (attachmentsBySourceId.size > 0 && repository) {
    const attachmentRows: BulkCreateAttachmentInput[] = []
    for (const [sourceId, atts] of attachmentsBySourceId) {
      const messageId = insertedMessageBySourceId.get(sourceId)
      if (!messageId) {
        continue
      }
      const messageCreatedAt = messageCreatedAtBySourceId.get(sourceId)
      if (!messageCreatedAt) {
        continue
      }
      for (const att of atts) {
        attachmentRows.push({
          id: createId(),
          workspaceId,
          conversationId,
          messageId,
          messageCreatedAt,
          sourceId: att.sourceId,
          fileType: att.fileType,
          mimeType: att.mimeType,
          originPath: att.originPath,
          size: att.size,
          width: att.width ?? undefined,
          height: att.height ?? undefined,
          name: att.name,
        })
      }
    }
    if (attachmentRows.length > 0) {
      const insertedAtt = await repository.bulkCreateAttachments(attachmentRows)
      for (const r of insertedAtt) {
        insertedAttachmentIds.push(r.id)
      }
    }
  }

  // Newest API-provided message times. Activity-timestamp bumps are NOT done
  // here — the caller batches them once per table via
  // applyCoexistActivityUpdates. Messages with no valid API timestamp are still
  // inserted with a persistence fallback, but never drive activity timestamps.
  const newestMessageAt = messagesWithApiTime.reduce<Date | null>(
    (max, m) => (!max || m.createdAt > max ? m.createdAt : max),
    null,
  )
  const oldestMessageAt = messagesWithApiTime.reduce<Date | null>(
    (min, m) => (!min || m.createdAt < min ? m.createdAt : min),
    null,
  )
  const newestIncomingMessageAt = messagesWithApiTime.reduce<Date | null>(
    (max, m) =>
      m.messageType === "incoming" && (!max || m.createdAt > max)
        ? m.createdAt
        : max,
    null,
  )

  // Independent of `newestMessageAt` — computed from ALL insertedRows so a
  // message inserted with `fallbackCreatedAt` (no valid API timestamp) still
  // counts for the AI-context marker. See `maxMessageId` doc comment.
  const newestMessageId = maxMessageId(insertedRows)

  return {
    importedMessages,
    skippedMessages,
    insertedAttachmentIds,
    newestMessageAt,
    oldestMessageAt,
    newestIncomingMessageAt,
    newestMessageId,
  }
}

/**
 * Backward-compat combined import for WhatsApp coexist flush. Internally
 * delegates to `bulkImportContacts` + per-contact `bulkImportMessages`.
 * Preserves the prior return shape (sourceId → contactInboxId map and
 * aggregate counters).
 */
export const bulkImportHistorical = async (props: {
  inbox: InboxModel
  workspaceId: string
  runId: string
  batch: HistoricalContactMessages[]
  /** `IntegrationWhatsapp.coexistAiReadsSyncedHistory` — when false (the
   *  default), `Conversation.aiContextLastMessageId` is advanced to the newest
   *  sync-inserted message id so the AI ignores this synced history; when
   *  true, the marker is left untouched and the AI reads the history. */
  aiReadsSyncedHistory: boolean
}): Promise<BulkImportHistoricalResult> => {
  const { inbox, workspaceId, runId, batch, aiReadsSyncedHistory } = props

  const contactsResult = await bulkImportContacts({
    inbox,
    workspaceId,
    contacts: batch.map((b) => b.contact),
  })

  const contactInboxIds = new Map<string, string>()
  for (const [sourceId, link] of contactsResult.contactInboxIds) {
    contactInboxIds.set(sourceId, link.contactInboxId)
  }

  let importedMessages = 0
  let skippedMessages = 0
  let failedMessages = 0
  const insertedAttachmentIds: string[] = []
  // Collected across the per-contact loop, then flushed in ONE statement per
  // table — keeps the ContactInbox/Conversation activity bumps out of the loop.
  const activityUpdates: CoexistActivityUpdate[] = []

  const limit = pLimit(3)
  await Promise.all(
    batch.map((entry) =>
      limit(async () => {
        if (entry.messages.length === 0) {
          return
        }
        const link = contactsResult.contactInboxIds.get(entry.contact.sourceId)
        if (!link) {
          // No link = the contact could not be set up (import error or workspace
          // cap) so its messages can never be imported. Count as FAILED, not
          // skipped: "skipped" means an intentional no-op (duplicate / outside
          // the retention window), whereas this is an error condition — same
          // semantics as the catch branch below.
          failedMessages += entry.messages.length
          return
        }
        try {
          const res = await bulkImportMessages({
            workspaceId,
            runId,
            contactInboxId: link.contactInboxId,
            contactId: link.contactId,
            conversationId: link.conversationId,
            messages: entry.messages,
          })
          importedMessages += res.importedMessages
          skippedMessages += res.skippedMessages
          for (const id of res.insertedAttachmentIds) {
            insertedAttachmentIds.push(id)
          }
          const aiMarkerMessageId = aiReadsSyncedHistory
            ? null
            : res.newestMessageId
          if (res.newestMessageAt !== null || aiMarkerMessageId !== null) {
            activityUpdates.push({
              contactInboxId: link.contactInboxId,
              contactId: link.contactId,
              conversationId: link.conversationId,
              newestMessageAt: res.newestMessageAt,
              oldestMessageAt: res.oldestMessageAt ?? res.newestMessageAt,
              newestIncomingMessageAt: res.newestIncomingMessageAt,
              aiMarkerMessageId,
            })
          }
        } catch (error) {
          logger.error(
            { error, runId, sourceId: entry.contact.sourceId },
            "[coexist] bulkImportMessages threw inside bulkImportHistorical",
          )
          failedMessages += entry.messages.length
        }
      }),
    ),
  )

  // One UPDATE per table for the whole bulk (not two per contact in the loop).
  await applyCoexistActivityUpdates(activityUpdates, { workspaceId })

  return {
    importedContacts: contactsResult.importedContacts,
    skippedContacts: contactsResult.skippedContacts,
    importedMessages,
    skippedMessages,
    failedMessages,
    contactInboxIds,
    insertedAttachmentIds,
    failureReason: contactsResult.failureReason,
  }
}
