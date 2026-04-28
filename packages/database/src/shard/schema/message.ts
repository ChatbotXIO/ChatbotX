import { createId } from "@chatbotx.io/utils"
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import type { ContentType, MessageType, SenderType } from "../../partials"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { contentType, messageType, senderType } from "../../schema"

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
      [x: string]: unknown
    }>(),
    messageType: messageType().$type<MessageType>().notNull(),
    contentType: contentType().$type<ContentType>().notNull(),
    senderType: senderType().$type<SenderType>().notNull(),
    senderId: bigintAsString(),
    sourceId: text(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
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
  ],
)
