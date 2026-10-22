import { createId } from "@chatbotx.io/utils"
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import type { FileType } from "../../../partials"
import { bigintAsString, timestampConfig } from "../../../partials/shared"
import { fileType } from "./enums"

export const attachmentModel = pgTable(
  "Attachment",
  {
    id: bigintAsString()
      .notNull()
      .$defaultFn(() => createId()),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    updatedAt: timestamp(timestampConfig).defaultNow().notNull(),
    workspaceId: bigintAsString().notNull(),
    conversationId: bigintAsString().notNull(),
    messageId: bigintAsString().notNull(),
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
    // Mirrors src/schema/attachment.ts and scripts/init-message-shard.sql.
    keepOriginal: boolean(),
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
