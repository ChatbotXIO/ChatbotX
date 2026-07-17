import { createId } from "@chatbotx.io/utils"
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import type { FileType } from "../partials"
import { fileTypes } from "../partials"
import { bigintAsString, timestampConfig } from "../partials/shared"

export const fileType = pgEnum(
  "fileType",
  fileTypes.options as [string, ...string[]],
)

export const attachmentModel = pgTable(
  "Attachment",
  {
    id: bigintAsString()
      .notNull()
      .$defaultFn(() => createId()),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    updatedAt: timestamp(timestampConfig).defaultNow().notNull(),
    // No FKs to Workspace/Conversation — Attachment is a compressed TimescaleDB
    // hypertable, and cascade DML into compressed chunks fails with "tuple
    // decompression limit exceeded". Orphaned rows from contact deletes are
    // tracked in MessageCleanup; matches the shard schema (see
    // src/sharding/scripts/init-message-shard.sql).
    workspaceId: bigintAsString().notNull(),
    conversationId: bigintAsString().notNull(),
    messageId: bigintAsString().notNull(),
    // Partition key of the parent Message row — required for chunk-scoped lookups.
    // No FK to Message because FK references to TimescaleDB hypertables are unsupported.
    messageCreatedAt: timestamp(timestampConfig).notNull(),
    fileType: fileType().$type<FileType>().notNull(),
    sourceId: text(),
    mimeType: text().notNull(),
    width: integer(),
    height: integer(),
    size: integer().default(0).notNull(),
    thumbnailPath: text(),
    originPath: text().notNull(),
    name: text(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    index("Attachment_message_idx").using(
      "btree",
      table.messageId.asc().nullsLast(),
      table.messageCreatedAt.desc().nullsLast(),
    ),
    index("Attachment_workspaceId_createdAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
    ),
    index("Attachment_conversationId_idx").using(
      "btree",
      table.conversationId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
    ),
  ],
)
