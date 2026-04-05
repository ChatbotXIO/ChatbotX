import { index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core"
import { fileTypes } from "../partials"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { conversationModel } from "./conversation"
import { messageModel } from "./message"
import { workspaceModel } from "./workspace"

export const fileType = pgEnum(
  "fileType",
  fileTypes.options as [string, ...string[]],
)

export const attachmentModel = pgTable(
  "Attachment",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    fileType: fileType().notNull(),
    messageId: bigintAsString()
      .notNull()
      .references(() => messageModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
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
    index("Attachment_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Attachment_messageId_idx").using(
      "btree",
      table.messageId.asc().nullsLast(),
    ),
  ],
)
