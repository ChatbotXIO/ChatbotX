import { createId } from "@chatbotx.io/utils"
import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import type { ContentType, MessageType, SenderType } from "../../../partials"
import { bigintAsString, timestampConfig } from "../../../partials/shared"
import type { RichResponseContentAttributes } from "../../../schema/message"
import { contentType, messageKind, messageType, senderType } from "./enums"

export const messageModel = pgTable(
  "Message",
  {
    id: bigintAsString()
      .notNull()
      .$defaultFn(() => createId()),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    updatedAt: timestamp(timestampConfig).defaultNow().notNull(),
    conversationId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    workspaceId: bigintAsString().notNull(),
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
    deletedAt: timestamp(timestampConfig),
    type: messageKind().notNull().default("message"),
    parentId: text(),
    attributes: jsonb().$type<{
      liked: boolean
      hidden: boolean
      /** Set once the comment's phone number was counted on its post; see `markPhoneCounted`. */
      phoneCounted?: boolean
      /** Set once the comment was counted in its post's comment count (a channel whose platform reports none); see `markCommentCounted`. */
      commentCounted?: boolean
      /** Set once the per-post hide setting's message charge was taken; see `claimQuotaMarker`. */
      quotaChargedHide?: boolean
      /** Set once the per-post skip setting's message charge was taken; see `claimQuotaMarker`. */
      quotaChargedSkip?: boolean
    }>(),
    sendError: text(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    // TimescaleDB requires unique constraints to include the partition key (createdAt).
    // This is a narrower dedup guard (same sourceId at exact same millisecond) used as a
    // DB-level fallback when the distributed lock expires under extreme load.
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
