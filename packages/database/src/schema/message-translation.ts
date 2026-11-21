import {
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type MessageTranslationDirection,
  type MessageTranslationFailureCode,
  type MessageTranslationStatus,
  messageTranslationDirections,
  messageTranslationFailureCodes,
  messageTranslationStatuses,
} from "../partials/translation"
import { conversationModel } from "./conversation"
import { workspaceModel } from "./workspace"

export const messageTranslationDirection = pgEnum(
  "messageTranslationDirection",
  messageTranslationDirections.options as [string, ...string[]],
)
export const messageTranslationStatus = pgEnum(
  "messageTranslationStatus",
  messageTranslationStatuses.options as [string, ...string[]],
)
export const messageTranslationFailureCode = pgEnum(
  "messageTranslationFailureCode",
  messageTranslationFailureCodes.options as [string, ...string[]],
)

/**
 * Translation of one message. `Message` lives in shards, so `messageId` has no
 * FK; rows disappear with the Conversation (a deleted contact cascades to its
 * conversations) and with the Workspace.
 */
export const messageTranslationModel = pgTable(
  "MessageTranslation",
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
    messageId: bigintAsString().notNull(),
    // Shard key: the worker reads the message back with it.
    messageCreatedAt: timestamp(timestampConfig).notNull(),
    direction: messageTranslationDirection()
      .$type<MessageTranslationDirection>()
      .notNull(),
    status: messageTranslationStatus()
      .$type<MessageTranslationStatus>()
      .notNull(),
    sourceLanguage: text(),
    targetLanguage: text().notNull(),
    confidence: doublePrecision(),
    // inbound: the translation; outbound: the text the agent typed.
    displayText: text(),
    modelId: text(),
    failureCode:
      messageTranslationFailureCode().$type<MessageTranslationFailureCode>(),
    // SHA-256 of `Message.text` (inbound), 128 bits base64url: stops a running
    // job from writing a translation of text the customer has since edited.
    sourceHash: text(),
  },
  (table) => [
    uniqueIndex("MessageTranslation_workspaceId_messageId_key").on(
      table.workspaceId,
      table.messageId,
    ),
    index("MessageTranslation_conversationId_idx").on(table.conversationId),
  ],
)
