import { createId } from "@chatbotx.io/utils"
import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import {
  type ContentType,
  contentTypes,
  type MessageType,
  messageTypes,
  type SenderType,
  senderTypes,
} from "../partials"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { contactInboxModel } from "./contact-inbox"
import { conversationModel } from "./conversation"
import { workspaceModel } from "./workspace"

export type RichButtonPayloadEntry = {
  executionId: string
  buttonId: string
  payload:
    | { type: "send_flow"; flowId: string }
    | { type: "actions"; actions: Record<string, unknown>[] }
    | { type: "text"; text: string }
    | { type: "unsupported"; reason: string }
}

export type RichResponseContentAttributes = {
  executionId: string
  buttonPayloads: Record<string, RichButtonPayloadEntry>
}

export const senderType = pgEnum(
  "senderType",
  senderTypes.options as [string, ...string[]],
)
export const messageType = pgEnum(
  "messageType",
  messageTypes.options as [string, ...string[]],
)
export const contentType = pgEnum(
  "contentType",
  contentTypes.options as [string, ...string[]],
)
export const messageKind = pgEnum("messageKind", ["message", "comment"])

export const messageModel = pgTable(
  "Message",
  {
    id: bigintAsString()
      .notNull()
      .$defaultFn(() => createId()),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    updatedAt: timestamp(timestampConfig).defaultNow().notNull(),
    conversationId: bigintAsString()
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    text: text(),
    contentAttributes: jsonb().$type<{
      richResponse?: RichResponseContentAttributes
      [x: string]: unknown
    }>(),
    messageType: messageType().$type<MessageType>().notNull(),
    contentType: contentType().$type<ContentType>().notNull(),
    senderType: senderType().$type<SenderType>().notNull(),
    senderId: bigintAsString(),
    sourceId: text(),
    deletedAt: timestamp({ withTimezone: true }),
    type: messageKind().notNull().default("message"),
    parentId: text(),
    attributes: jsonb().$type<{ liked: boolean; hidden: boolean }>(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    // TimescaleDB dedup fallback: unique constraint must include the partition key.
    unique("Message_source_dedup_idx").on(
      table.contactInboxId,
      table.sourceId,
      table.createdAt,
    ),
    index("Message_conversation_history_idx").using(
      "btree",
      table.conversationId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
      table.id.desc().nullsLast(),
    ),
    index("Message_workspace_created_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
    ),
    index("Message_contactInboxId_sourceId_createdAt_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
    ),
    index("Message_conversationId_type_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.conversationId.asc().nullsLast(),
      table.type.asc().nullsLast(),
      table.createdAt.desc().nullsLast(),
    ),
    index("Message_parentId_idx")
      .using(
        "btree",
        table.workspaceId.asc().nullsLast(),
        table.parentId.asc().nullsLast(),
        table.type.asc().nullsLast(),
        table.createdAt.desc().nullsLast(),
      )
      .where(sql`"parentId" IS NOT NULL`),
  ],
)
