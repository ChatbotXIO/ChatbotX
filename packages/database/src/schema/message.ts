import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
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
    // Comentário interno (só visível pra equipe, não vai pro contato).
    // Padrão Respond.io — substitui a feature "Notas" separada.
    // 2026-05-24 — Inbox Sprint 4.
    isInternal: boolean().default(false).notNull(),
    // Delivery tracking — populado por webhook do canal (WhatsApp/Messenger/etc).
    // ✓ enviado (criação implícita), ✓✓ deliveredAt, ✓✓ azul readAt, ⚠️ failedAt.
    deliveredAt: timestamp(timestampConfig),
    readAt: timestamp(timestampConfig),
    failedAt: timestamp(timestampConfig),
    failureReason: text(),
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
    index("Message_isInternal_idx").using(
      "btree",
      table.isInternal.asc().nullsLast(),
    ),
  ],
)
