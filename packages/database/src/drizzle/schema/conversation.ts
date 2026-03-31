import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { z } from "zod"
import { userModel } from "./auth"
import { chatbotModel } from "./chatbot"
import { contactModel } from "./contact"
import { inboxModel, inboxTeamModel } from "./inbox"
import { sharedColumns, timestampConfig } from "./shared"

export const channelTypes = z.enum([
  "omnichannel",
  "webchat",
  "messenger",
  "whatsapp",
  "zalo",
])
export type ChannelType = z.infer<typeof channelTypes>

export const senderType = pgEnum("SenderType", [
  "bot",
  "contact",
  "system",
  "user",
  "api",
])
export const messageType = pgEnum("MessageType", [
  "incoming",
  "outgoing",
  "activity",
])
export const contentType = pgEnum("ContentType", ["text", "location"])
export const fileType = pgEnum("FileType", [
  "image",
  "video",
  "audio",
  "gif",
  "file",
])

export const attachmentModel = pgTable(
  "attachments",
  {
    ...sharedColumns,
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigint("conversation_id", { mode: "bigint" })
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    fileType: fileType("file_type").notNull(),
    messageId: bigint("message_id", { mode: "bigint" })
      .notNull()
      .references(() => messageModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sourceId: text("source_id"),
    mimeType: text("mime_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    size: integer("size").default(0).notNull(),
    thumbnailPath: text("thumbnail_path"),
    originPath: text("origin_path").notNull(),
    name: text("name"),
  },
  (table) => [
    index("attachments_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("attachments_message_id_idx").using(
      "btree",
      table.messageId.asc().nullsLast(),
    ),
  ],
)

export const conversationModel = pgTable(
  "conversations",
  {
    ...sharedColumns,
    liveChatEnabled: boolean("live_chat_enabled").default(false).notNull(),
    archivedAt: timestamp("archived_at", timestampConfig),
    channel: text("channel").notNull().default("webchat"),
    sourceId: text("source_id"),
    conversationAttributes: jsonb("conversation_attributes").$type<{
      [x: string]: unknown
    }>(),
    contactLastReadAt: timestamp("contact_last_read_at", timestampConfig),
    agentLastReadAt: timestamp("agent_last_read_at", timestampConfig),
    lastActivityAt: timestamp("last_activity_at", timestampConfig)
      .defaultNow()
      .notNull(),
    followed: boolean("followed").default(false).notNull(),
    assignedUserId: bigint("assigned_user_id", { mode: "bigint" }).references(
      () => userModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    assignedInboxTeamId: bigint("assigned_inbox_team_id", {
      mode: "bigint",
    }).references(() => inboxTeamModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigint("contact_id", { mode: "bigint" })
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigint("inbox_id", { mode: "bigint" })
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    adminRepliedAt: timestamp("admin_replied_at", timestampConfig),
    contactRepliedAt: timestamp("contact_replied_at", timestampConfig),
  },
  (table) => [
    index("conversations_chatbot_id_source_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    uniqueIndex("conversations_contact_id_key").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
  ],
)

export const conversationParticipantModel = pgTable(
  "conversation_participants",
  {
    ...sharedColumns,
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigint("conversation_id", { mode: "bigint" })
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("conversation_participants_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("conversation_participants_conversation_id_idx").using(
      "btree",
      table.conversationId.asc().nullsLast(),
    ),
    uniqueIndex("conversation_participants_conversation_id_user_id_key").using(
      "btree",
      table.conversationId.asc().nullsLast(),
      table.userId.asc().nullsLast(),
    ),
  ],
)

export const savedReplyModel = pgTable("saved_replies", {
  ...sharedColumns,
  shortcut: text("shortcut").notNull(),
  text: text("text").notNull(),
  userId: bigint("user_id", { mode: "bigint" })
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})

export const messageModel = pgTable(
  "messages",
  {
    ...sharedColumns,
    conversationId: bigint("conversation_id", { mode: "bigint" })
      .notNull()
      .references(() => conversationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigint("inbox_id", { mode: "bigint" })
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    text: text("text"),
    contentAttributes: jsonb("content_attributes").$type<{
      [x: string]: unknown
    }>(),
    messageType: messageType("message_type").notNull(),
    contentType: contentType("content_type").notNull(),
    senderType: senderType("sender_type").notNull(),
    senderId: bigint("sender_id", { mode: "bigint" }),
    sourceId: text("source_id"),
  },
  (table) => [
    index("messages_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    uniqueIndex("messages_chatbot_id_source_id_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    index("messages_conversation_id_idx").using(
      "btree",
      table.conversationId.asc().nullsLast(),
    ),
    index("messages_inbox_id_idx").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    index("messages_sender_type_sender_id_idx").using(
      "btree",
      table.senderType.asc().nullsLast(),
      table.senderId.asc().nullsLast(),
    ),
  ],
)
