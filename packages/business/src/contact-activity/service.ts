import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type ContactActivityReferenceType,
  type ContactActivityType,
  contactActivityReferenceTypes,
  contactActivityTypes,
  isAllowedContactActivity,
  NO_REFERENCE_ID,
  UNSCOPED_PARENT_REFERENCE_ID,
} from "@chatbotx.io/database/partials"
import {
  CONTACT_ACTIVITY_TABLES,
  type ContactActivityRecord,
  type ContactDeliveredRecord,
  contactActivityRepository,
} from "@chatbotx.io/database/repositories/contact-activity"
import { workspaceRepository } from "@chatbotx.io/database/repositories/workspace"
import { normalizeForMatch } from "@chatbotx.io/utils/normalize-for-match"
import { workspaceDeletionStartedException } from "../errors"
import { logger } from "../logger"
import { contactActivityEnv } from "./keys"

export const CONTACT_ACTIVITY_WRITE_CHUNK_SIZE = 500
// Same pacing as the other heavy per-workspace purges (workspace-lifecycle):
// 5000 rows per batch, up to 10M rows per table per run.
export const CONTACT_ACTIVITY_PURGE_BATCH_SIZE = 5000
export const CONTACT_ACTIVITY_PURGE_MAX_BATCHES = 2000
/**
 * Characters of a keyword message kept for "Sent message" matching. The btree
 * index on the text caps an entry at 2704 bytes, so an unbounded insert would
 * fail on a long message and, because the write runs before the reply is
 * sent, block the keyword auto-reply. 512 characters stay under the cap even
 * at 4 bytes each. The original `text` is stored whole.
 */
export const KEYWORD_MESSAGE_MATCH_MAX_CHARS = 512

/** Cuts on code points, so a surrogate pair is never split into invalid UTF-8. */
const truncateForMatch = (text: string): string => {
  const characters = Array.from(text)
  return characters.length > KEYWORD_MESSAGE_MATCH_MAX_CHARS
    ? characters.slice(0, KEYWORD_MESSAGE_MATCH_MAX_CHARS).join("")
    : text
}

export type ContactActivityEntry = {
  activityType: ContactActivityType
  contactId: string
  /** Producer event time, not processing time. */
  occurredAt: Date
  parentReferenceId?: string
  /** Omit for an activity without a reference (e.g. email "No Topic"). */
  referenceId?: string
  referenceType: ContactActivityReferenceType
}

export type ContactKeywordMatchInput = {
  automatedResponseId: string
  contactId: string
  messageId: string
  occurredAt: Date
  text: string
  workspaceId: string
}

const toRecord = (entry: ContactActivityEntry): ContactActivityRecord => ({
  activityType: entry.activityType,
  contactId: entry.contactId,
  occurredAt: entry.occurredAt,
  parentReferenceId: entry.parentReferenceId ?? UNSCOPED_PARENT_REFERENCE_ID,
  referenceId: entry.referenceId ?? NO_REFERENCE_ID,
  referenceType: entry.referenceType,
})

const activityKey = (record: ContactActivityRecord) =>
  [
    record.contactId,
    record.activityType,
    record.referenceType,
    record.parentReferenceId,
    record.referenceId,
  ].join(":")

const BIGINT_ID_PATTERN = /^-?\d+$/
const BIGINT_MIN = -(2n ** 63n)
const BIGINT_MAX = 2n ** 63n - 1n

/** Ids are stored as bigint; a non-numeric or out-of-range id must never reach SQL. */
const isBigintId = (value: string): boolean => {
  if (!BIGINT_ID_PATTERN.test(value)) {
    return false
  }
  const id = BigInt(value)
  return id >= BIGINT_MIN && id <= BIGINT_MAX
}

const compareIds = (left: string, right: string): number => {
  const a = BigInt(left)
  const b = BigInt(right)
  if (a === b) {
    return 0
  }
  return a < b ? -1 : 1
}

// PostgreSQL orders an enum by declaration order, which is the registry's
// option order, so sorting by option index matches the repository's ORDER BY.
const compareActivities = (
  left: ContactActivityRecord,
  right: ContactActivityRecord,
): number =>
  compareIds(left.contactId, right.contactId) ||
  contactActivityTypes.options.indexOf(left.activityType) -
    contactActivityTypes.options.indexOf(right.activityType) ||
  contactActivityReferenceTypes.options.indexOf(left.referenceType) -
    contactActivityReferenceTypes.options.indexOf(right.referenceType) ||
  compareIds(left.parentReferenceId, right.parentReferenceId) ||
  compareIds(left.referenceId, right.referenceId)

/** One row per primary key (a duplicate key in one INSERT is a SQL error), earliest event wins. */
const dedupeActivities = (
  records: ContactActivityRecord[],
): ContactActivityRecord[] => {
  const byKey = new Map<string, ContactActivityRecord>()
  for (const record of records) {
    const existing = byKey.get(activityKey(record))
    if (!existing || record.occurredAt < existing.occurredAt) {
      byKey.set(activityKey(record), record)
    }
  }
  // Ascending key order across chunks, so every transaction locks Contact and
  // activity rows in the same order as the contact-delete path (no deadlock).
  return Array.from(byKey.values()).sort(compareActivities)
}

/** One row per contact, latest delivery wins. */
const collapseDelivered = (
  records: ContactDeliveredRecord[],
): ContactDeliveredRecord[] => {
  const byContact = new Map<string, ContactDeliveredRecord>()
  for (const record of records) {
    const existing = byContact.get(record.contactId)
    if (!existing || record.deliveredAt > existing.deliveredAt) {
      byContact.set(record.contactId, record)
    }
  }
  return Array.from(byContact.values()).sort((left, right) =>
    compareIds(left.contactId, right.contactId),
  )
}

const chunk = <Item>(items: Item[], size: number): Item[][] => {
  const chunks: Item[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

class ContactActivityService {
  private writesEnabled(): boolean {
    return contactActivityEnv().CONTACT_ACTIVITY_WRITES_ENABLED
  }

  /**
   * Records that contacts did something. Idempotent: the primary key is the
   * dedupe key, so retries and duplicate events are no-ops (and an
   * out-of-order event can only move `firstOccurredAt` earlier). Pass `tx` to
   * join the producer's own transaction; otherwise one fenced transaction is
   * opened. Returns false when writing is skipped (switch off or purging).
   */
  async record(input: {
    entries: ContactActivityEntry[]
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<boolean> {
    if (!this.writesEnabled() || input.entries.length === 0) {
      return false
    }

    const candidates = input.entries.map(toRecord)
    for (const record of candidates) {
      if (!isAllowedContactActivity(record)) {
        throw new Error(
          `Contact activity ${record.activityType}/${record.referenceType} is not registered`,
        )
      }
    }
    // A producer id that is not a bigint (an imported flow with a legacy node
    // id) is skipped rather than failing the caller's flow run or message send.
    const records = dedupeActivities(
      candidates.filter((record) => {
        const valid =
          isBigintId(record.contactId) &&
          isBigintId(record.parentReferenceId) &&
          isBigintId(record.referenceId)
        if (!valid) {
          logger.warn(
            {
              activityType: record.activityType,
              contactId: record.contactId,
              referenceId: record.referenceId,
              workspaceId: input.workspaceId,
            },
            "contact-activity: skipped an activity with a non-bigint id",
          )
        }
        return valid
      }),
    )
    if (records.length === 0) {
      return false
    }

    const write = async (tx: DatabaseClient): Promise<boolean> => {
      if (
        !(await workspaceRepository.lockWorkspaceForChildWrite(
          { workspaceId: input.workspaceId },
          tx,
        ))
      ) {
        return false
      }
      for (const batch of chunk(records, CONTACT_ACTIVITY_WRITE_CHUNK_SIZE)) {
        await contactActivityRepository.upsertActivities(
          { records: batch, workspaceId: input.workspaceId },
          tx,
        )
      }
      return true
    }

    return input.tx ? await write(input.tx) : await db.transaction(write)
  }

  /**
   * Records an inbound message that matched a keyword rule: the "keyword
   * received" activity plus the message text, in one transaction, keyed by
   * `messageId` so a retried dispatch does not duplicate either.
   */
  async recordKeywordMatch(
    input: ContactKeywordMatchInput & { tx?: DatabaseClient },
  ): Promise<boolean> {
    if (!this.writesEnabled()) {
      return false
    }

    const write = async (tx: DatabaseClient): Promise<boolean> => {
      const recorded = await this.record({
        entries: [
          {
            activityType: "automatedResponseMatched",
            contactId: input.contactId,
            occurredAt: input.occurredAt,
            referenceId: input.automatedResponseId,
            referenceType: "automatedResponse",
          },
        ],
        tx,
        workspaceId: input.workspaceId,
      })
      if (!recorded) {
        return false
      }
      await contactActivityRepository.insertKeywordMessage(
        {
          record: {
            automatedResponseId: input.automatedResponseId,
            contactId: input.contactId,
            messageId: input.messageId,
            // Trimmed like the filter's search text, so eq/startsWith meet it.
            normalizedText: truncateForMatch(
              normalizeForMatch(input.text).trim(),
            ),
            occurredAt: input.occurredAt,
            text: input.text,
          },
          workspaceId: input.workspaceId,
        },
        tx,
      )
      return true
    }

    return input.tx ? await write(input.tx) : await db.transaction(write)
  }

  /**
   * Records the latest confirmed delivery per contact. A batch is collapsed to
   * one row per contact first; `lastDeliveredAt` only moves forward, so an
   * out-of-order or duplicate receipt is a no-op.
   */
  async recordDelivered(input: {
    records: ContactDeliveredRecord[]
    workspaceId: string
  }): Promise<boolean> {
    if (!this.writesEnabled() || input.records.length === 0) {
      return false
    }

    const records = collapseDelivered(input.records)
    return await db.transaction(async (tx) => {
      if (
        !(await workspaceRepository.lockWorkspaceForChildWrite(
          { workspaceId: input.workspaceId },
          tx,
        ))
      ) {
        return false
      }
      for (const batch of chunk(records, CONTACT_ACTIVITY_WRITE_CHUNK_SIZE)) {
        await contactActivityRepository.upsertLastDelivered(
          { records: batch, workspaceId: input.workspaceId },
          tx,
        )
      }
      return true
    })
  }

  /**
   * Deletes the contacts' activity rows inside the contact-delete transaction.
   * The caller has already locked the contacts `FOR UPDATE` (see
   * `contactInboxPostService.deleteForContacts`), so a concurrent writer
   * blocks on its `FOR KEY SHARE` and then finds no contact to attach to.
   */
  async deleteForContacts(input: {
    contactIds: string[]
    tx: DatabaseClient
    workspaceId: string
  }): Promise<number> {
    if (
      !(await workspaceRepository.lockWorkspaceForChildWrite(
        { workspaceId: input.workspaceId },
        input.tx,
      ))
    ) {
      throw workspaceDeletionStartedException()
    }

    return await contactActivityRepository.deleteByContactIds(
      { contactIds: input.contactIds, workspaceId: input.workspaceId },
      input.tx,
    )
  }

  /**
   * Drains a workspace's rows from all activity tables in self-committing
   * batches. `complete` is false while rows remain, so the purge job defers
   * the workspace delete to its next run.
   */
  async purgeWorkspace(input: {
    batchSize?: number
    maxBatches?: number
    workspaceId: string
  }): Promise<{ complete: boolean; deleted: number; table?: string }> {
    const batchSize = input.batchSize ?? CONTACT_ACTIVITY_PURGE_BATCH_SIZE
    const maxBatches = input.maxBatches ?? CONTACT_ACTIVITY_PURGE_MAX_BATCHES
    let deleted = 0

    for (const table of CONTACT_ACTIVITY_TABLES) {
      for (let batch = 0; batch < maxBatches; batch++) {
        const deletedBatch =
          await contactActivityRepository.deleteWorkspaceBatch({
            limit: batchSize,
            table,
            workspaceId: input.workspaceId,
          })
        deleted += deletedBatch
        if (deletedBatch < batchSize) {
          break
        }
      }

      if (
        await contactActivityRepository.hasWorkspaceRows({
          table,
          workspaceId: input.workspaceId,
        })
      ) {
        return { complete: false, deleted, table }
      }
    }

    return { complete: true, deleted }
  }
}

export const contactActivityService = new ContactActivityService()
