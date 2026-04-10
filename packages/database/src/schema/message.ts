import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type ContentType,
  contentTypes,
  type MessageType,
  messageTypes,
  type SenderType,
  senderTypes,
} from "../partials"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { contactInboxModel } from "./contact-inbox"
import { conversationModel } from "./conversation"
import { workspaceModel } from "./workspace"

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

export const messageModel = pgTable(
  "Message",
  {
    ...sharedColumns,
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
      [x: string]: unknown
    }>(),
    messageType: messageType().$type<MessageType>().notNull(),
    contentType: contentType().$type<ContentType>().notNull(),
    senderType: senderType().$type<SenderType>().notNull(),
    senderId: bigintAsString(),
    sourceId: text(),
  },
  (table) => [
    index("Message_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("Message_contactInboxId_sourceId_key").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    index("Message_conversationId_idx").using(
      "btree",
      table.conversationId.asc().nullsLast(),
    ),
    index("Message_inboxId_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
    ),
    index("Message_senderType_senderId_idx").using(
      "btree",
      table.senderType.asc().nullsLast(),
      table.senderId.asc().nullsLast(),
    ),
  ],
)
