import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { messageCleanupStatuses } from "../partials/message-cleanup"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"

export const messageCleanupStatus = pgEnum(
  "MessageCleanupStatus",
  messageCleanupStatuses.options as [string, ...string[]],
)

/**
 * Tombstone queue for messages orphaned by a contact delete.
 *
 * Message/Attachment are TimescaleDB hypertables with compressed chunks, so
 * they no longer cascade from Contact/Conversation (deleting compressed rows
 * inline hits the decompression limit). Instead, deleting a contact upserts one
 * row per deleted contact-inbox here; the actual message purge is performed
 * later by a separate process reading `pending` rows.
 *
 * Rows snapshot everything needed for the purge because the source rows are
 * gone by the time it runs. No column carries an FK — `workspaceId`,
 * `contactId`, `contactInboxId`, and `conversationIds` all reference rows that
 * are deleted (or being deleted) by the time this row is written, and the
 * table must outlive them. If the contact is re-created (same inbox + platform
 * sourceId), the matching row is removed so the returning contact keeps their
 * history.
 */
export const messageCleanupModel = pgTable(
  "MessageCleanup",
  {
    ...sharedColumns,
    workspaceId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    inboxId: bigintAsString().notNull(),
    sourceId: text().notNull(),
    conversationIds: jsonb().$type<string[]>().notNull(),
    // Lower bound for shard lookups (firstInteractionAt ?? createdAt of the
    // deleted contact-inbox).
    sinceTime: timestamp(timestampConfig),
    // Upper bound: the purge must only touch messages created at or before this
    // moment, so a re-created contact's new history can never be swept up.
    deletedAt: timestamp(timestampConfig).defaultNow().notNull(),
    status: messageCleanupStatus()
      .default(messageCleanupStatuses.enum.pending)
      .notNull(),
    attempts: integer().default(0).notNull(),
    lastError: text(),
    processedAt: timestamp(timestampConfig),
  },
  (table) => [
    // Same identity key as ContactInbox_inboxId_sourceId_key: re-deleting a
    // re-created contact updates the existing row instead of inserting a new
    // one, and contact re-creation can cancel the pending cleanup by key.
    uniqueIndex("MessageCleanup_inboxId_sourceId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    index("MessageCleanup_status_createdAt_idx").using(
      "btree",
      table.status,
      table.createdAt,
    ),
    index("MessageCleanup_workspaceId_idx").using("btree", table.workspaceId),
  ],
)
