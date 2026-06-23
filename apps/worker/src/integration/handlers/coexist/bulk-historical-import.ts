// biome-ignore-all lint/suspicious/noBitwiseOperators: bit-packing 63-bit snowflake IDs

import { db, eq, inArray, sql } from "@chatbotx.io/database/client"
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
  userQuotaModel,
  workspaceModel,
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
// They are derived from a stable hash of the message `sourceId` — NOT from the
// run — so the id is a pure function of (createdAt, sourceId). This is the key
// difference from the old [run-partition][per-run-seq] scheme, which re-minted
// ids every run: two DISTINCT messages at the same second in two runs sharing
// `runId mod 1024` produced the SAME id (different sourceId → bypassed the
// (contactInboxId, sourceId, createdAt) arbiter → hit the PK). Hashing sourceId
// makes ids idempotent and collision-free across runs; two distinct messages
// only clash on a rare 14-bit hash collision, resolved by the per-import probe
// below and the bulkCreate PK retry.

const COEXIST_EPOCH_MS = new Date("2004-02-01").getTime()
const COEXIST_TS_BITS = 53n
const COEXIST_DISAMBIG_BITS = 14n
const COEXIST_TS_SHIFT = COEXIST_DISAMBIG_BITS
const COEXIST_DISAMBIG_MASK = (1n << COEXIST_DISAMBIG_BITS) - 1n
const COEXIST_MAX_TS = 1n << COEXIST_TS_BITS
const COEXIST_DISAMBIG_SPACE = 1n << COEXIST_DISAMBIG_BITS

export type HistoricalIdFactory = (date: Date, sourceId: string) => string

// FNV-1a over `sourceId`, folded into the 14-bit disambiguator space. Pure and
// deterministic: the same message always maps to the same starting slot.
const hashSourceId = (sourceId: string): bigint => {
  let hash = 2_166_136_261
  for (let i = 0; i < sourceId.length; i++) {
    hash ^= sourceId.charCodeAt(i)
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

  return (date: Date, sourceId: string): string => {
    const baseTs = BigInt(date.getTime() - COEXIST_EPOCH_MS)
    if (baseTs < 0n || baseTs >= COEXIST_MAX_TS) {
      throw new Error(
        `createHistoricalIdFactory: ${date.toISOString()} out of range`,
      )
    }
    const start = hashSourceId(sourceId)
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
  /** Newest API-provided incoming message createdAt in this call (null when
   *  none). Used only for ContactInbox.lastIncomingMessageAt. */
  newestIncomingMessageAt: Date | null
}

/** One contact's activity-timestamp bump, collected by a batching caller. */
export type CoexistActivityUpdate = {
  contactInboxId: string
  conversationId: string
  newestMessageAt: Date
  newestIncomingMessageAt: Date | null
}

/**
 * Bump activity timestamps for a whole bulk in ONE statement per table (not two
 * queries per contact in the import loop). In coexist these columns must mirror
 * the newest API-provided message time, not the sync worker's wall clock:
 *
 *   - ContactInbox.lastMessageAt: set from the newest message.
 *   - ContactInbox.lastIncomingMessageAt: advance from the newest incoming
 *     message only; outgoing history must not move this field.
 *   - Conversation.lastActivityAt: set from the newest message.
 *
 * Each UPDATE joins a VALUES table of the deduped rows. This keeps the write
 * batched while avoiding pg array-parameter casting differences. Failures must
 * propagate: otherwise a coexist run can be marked succeeded while these
 * denormalized activity columns remain null or stuck at row-creation time.
 */
export const applyCoexistActivityUpdates = async (
  updates: CoexistActivityUpdate[],
): Promise<void> => {
  if (updates.length === 0) {
    return
  }

  // Dedup by id, keeping the newest ts. ids are unique per contact within a
  // batch, but a resumed/overlapping batch could repeat one — and a duplicate
  // join key in VALUES would update the row twice with no defined winner.
  const newestByContactInbox = new Map<
    string,
    {
      newestMessageAt: Date
      newestIncomingMessageAt: Date | null
    }
  >()
  const newestByConversation = new Map<string, Date>()
  for (const u of updates) {
    const ci = newestByContactInbox.get(u.contactInboxId)
    if (ci) {
      if (ci.newestMessageAt < u.newestMessageAt) {
        ci.newestMessageAt = u.newestMessageAt
      }
      if (
        u.newestIncomingMessageAt &&
        (!ci.newestIncomingMessageAt ||
          ci.newestIncomingMessageAt < u.newestIncomingMessageAt)
      ) {
        ci.newestIncomingMessageAt = u.newestIncomingMessageAt
      }
    } else {
      newestByContactInbox.set(u.contactInboxId, {
        newestMessageAt: u.newestMessageAt,
        newestIncomingMessageAt: u.newestIncomingMessageAt,
      })
    }
    const cv = newestByConversation.get(u.conversationId)
    if (!cv || cv < u.newestMessageAt) {
      newestByConversation.set(u.conversationId, u.newestMessageAt)
    }
  }

  if (newestByContactInbox.size > 0) {
    const contactInboxRows = [...newestByContactInbox.entries()].map(
      ([id, u]) => sql`(
        ${id}::int8,
        ${u.newestMessageAt}::timestamptz,
        ${u.newestIncomingMessageAt}::timestamptz
      )`,
    )

    await db.execute(sql`
      UPDATE "ContactInbox" AS t
      SET
        "lastMessageAt" = CASE
          WHEN t."lastMessageAt" IS NULL OR t."lastMessageAt" < u.message_ts
            THEN u.message_ts
          ELSE t."lastMessageAt"
        END,
        "lastIncomingMessageAt" = CASE
          WHEN
            u.incoming_ts IS NOT NULL
            AND (
              t."lastIncomingMessageAt" IS NULL
              OR t."lastIncomingMessageAt" < u.incoming_ts
            )
            THEN u.incoming_ts
          ELSE t."lastIncomingMessageAt"
        END
      FROM (VALUES ${sql.join(contactInboxRows, sql`, `)})
        AS u(id, message_ts, incoming_ts)
      WHERE t."id" = u.id
    `)
  }

  if (newestByConversation.size > 0) {
    const conversationRows = [...newestByConversation.entries()].map(
      ([id, ts]) => sql`(${id}::int8, ${ts}::timestamptz)`,
    )

    await db.execute(sql`
      UPDATE "Conversation" AS t
      SET "lastActivityAt" = CASE
        WHEN t."lastActivityAt" IS NULL OR t."lastActivityAt" < u.ts THEN u.ts
        ELSE t."lastActivityAt"
      END
      FROM (VALUES ${sql.join(conversationRows, sql`, `)}) AS u(id, ts)
      WHERE t."id" = u.id
    `)
  }
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
 * existing ContactInbox rows, lock WorkspaceUsage to enforce the per-workspace
 * contact cap, and bulk-insert new Contact/ContactInbox/Conversation rows.
 *
 * Race-safe via `onConflictDoNothing` + post-insert re-select for losers, with
 * orphan Contact cleanup. Idempotent — re-running with the same batch returns
 * the existing links without creating duplicates.
 *
 * Returns one `ContactImportLink` per dedup'd sourceId (existing + newly
 * created). Callers use this map to dispatch downstream avatar / message
 * fetches without an additional DB lookup.
 */
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
  let skippedContacts = 0
  let failureReason: string | undefined
  const contactInboxIds = new Map<string, ContactImportLink>()

  await db.transaction(async (tx) => {
    // 1. Find existing ContactInbox rows.
    const existingRows = await tx
      .select({
        id: contactInboxModel.id,
        sourceId: contactInboxModel.sourceId,
        contactId: contactInboxModel.contactId,
      })
      .from(contactInboxModel)
      .where(
        sql`${contactInboxModel.inboxId} = ${inbox.id} AND ${contactInboxModel.sourceId} IN ${sourceIds}`,
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

    // 2. Cap check under row lock.
    let acceptedNew: typeof newEntries = newEntries
    if (newEntries.length > 0) {
      const usageRows = await tx.execute<{
        contactsCount: number
        maxContacts: number
      }>(
        sql`SELECT "contactsCount", "maxContacts" FROM "WorkspaceUsage" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`,
      )
      const usage = usageRows.rows[0]
      if (usage) {
        const slots = Math.max(0, usage.maxContacts - usage.contactsCount)
        acceptedNew = newEntries.slice(0, slots)
        const rejected = newEntries.slice(slots)
        skippedContacts = rejected.length
        if (rejected.length > 0) {
          failureReason = `workspace contact cap reached (${usage.contactsCount}/${usage.maxContacts}) — ${rejected.length} contact(s) rejected`
        }
      } else {
        logger.warn(
          { workspaceId },
          "[coexist] WorkspaceUsage row missing — rejecting all new contacts",
        )
        skippedContacts = newEntries.length
        acceptedNew = []
        failureReason = `WorkspaceUsage row missing for workspace ${workspaceId} — all ${newEntries.length} new contact(s) rejected`
      }
    }

    // 3. Insert Contact + ContactInbox + Conversation for acceptedNew.
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

      const contactInboxRows = acceptedNew.map(([sourceId], i) => ({
        id: createId(),
        inboxId: inbox.id,
        contactId: contactRows[i]?.id,
        originalContactId: contactRows[i]?.id,
        source: inbox.channel,
        sourceId,
        channel: inbox.channel,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      const conversationRows = acceptedNew.map((_entry, i) => ({
        id: createId(),
        workspaceId,
        contactId: contactRows[i]?.id,
      }))

      const insertedInboxes = await tx
        .insert(contactInboxModel)
        .values(contactInboxRows)
        .onConflictDoNothing({
          target: [contactInboxModel.inboxId, contactInboxModel.sourceId],
        })
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

      if (racedSourceIds.length > 0) {
        const winners = await tx
          .select({
            id: contactInboxModel.id,
            sourceId: contactInboxModel.sourceId,
            contactId: contactInboxModel.contactId,
          })
          .from(contactInboxModel)
          .where(
            sql`${contactInboxModel.inboxId} = ${inbox.id} AND ${contactInboxModel.sourceId} IN ${racedSourceIds}`,
          )
        for (const w of winners) {
          insertedInboxes.push(w)
          insertedSourceIds.add(w.sourceId)
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

      if (trulyNew > 0) {
        const workspaceRow = await tx
          .select({ ownerId: workspaceModel.ownerId })
          .from(workspaceModel)
          .where(eq(workspaceModel.id, workspaceId))
          .limit(1)
        const ownerId = workspaceRow[0]?.ownerId
        if (ownerId) {
          await tx
            .insert(userQuotaModel)
            .values({
              userId: ownerId,
              contactsUsed: trulyNew,
              syncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: userQuotaModel.userId,
              set: {
                contactsUsed: sql`${userQuotaModel.contactsUsed} + ${trulyNew}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              },
            })
        }
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
            source: inbox.channel,
            createdAt: new Date(),
          })
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
    newestIncomingMessageAt: null,
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
      id: makeMessageId(createdAt, msg.sourceId),
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
  // PK collision (snowflake id clash across runs) triggers a one-time retry with
  // fresh IDs; the onConflictDoNothing inside bulkCreate handles sourceId dupes.
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
      if (!isUniqueMessagePkViolation(err)) {
        throw err
      }
      logger.warn(
        { runId, total: messageInputs.length },
        "[coexist] Message PK collision — regenerating IDs and retrying",
      )
      const retried = messageInputs.map((input) => ({
        ...input,
        // Re-call advances past the colliding slot via the factory's used-set.
        id: makeMessageId(input.createdAt as Date, input.sourceId ?? ""),
      }))
      insertedRows = await repository.bulkCreate(retried)
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
  const newestIncomingMessageAt = messagesWithApiTime.reduce<Date | null>(
    (max, m) =>
      m.messageType === "incoming" && (!max || m.createdAt > max)
        ? m.createdAt
        : max,
    null,
  )

  return {
    importedMessages,
    skippedMessages,
    insertedAttachmentIds,
    newestMessageAt,
    newestIncomingMessageAt,
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
}): Promise<BulkImportHistoricalResult> => {
  const { inbox, workspaceId, runId, batch } = props

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
          if (res.newestMessageAt) {
            activityUpdates.push({
              contactInboxId: link.contactInboxId,
              conversationId: link.conversationId,
              newestMessageAt: res.newestMessageAt,
              newestIncomingMessageAt: res.newestIncomingMessageAt,
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
  await applyCoexistActivityUpdates(activityUpdates)

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
