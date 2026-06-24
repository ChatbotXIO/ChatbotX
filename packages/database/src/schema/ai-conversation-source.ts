import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  aiConversationSourceStatuses,
  aiConversationSourceTypes,
} from "../partials"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { conversationModel } from "./conversation"
import { workspaceModel } from "./workspace"

export const aiConversationSourceType = pgEnum(
  "aiConversationSourceType",
  aiConversationSourceTypes.options as [string, ...string[]],
)

export const aiConversationSourceStatus = pgEnum(
  "aiConversationSourceStatus",
  aiConversationSourceStatuses.options as [string, ...string[]],
)

export const aiConversationSourceModel = pgTable(
  "AIConversationSource",
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
    // No FK to Message/Attachment — FK references to TimescaleDB hypertables are unsupported.
    messageId: bigintAsString().notNull(),
    attachmentId: bigintAsString(),
    sourceType: aiConversationSourceType().notNull(),
    status: aiConversationSourceStatus().default("pending").notNull(),
    sourceKey: text().notNull(),
    contentHash: text(),
    mimeType: text(),
    title: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    summary: text(),
    errorMessage: text(),
  },
  (table) => [
    index("AIConversationSource_lookup_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.conversationId.asc().nullsLast(),
      table.sourceType.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    uniqueIndex("AIConversationSource_workspaceId_sourceType_sourceKey_key").on(
      table.workspaceId,
      table.sourceType,
      table.sourceKey,
    ),
    index("AIConversationSource_messageId_idx").using(
      "btree",
      table.messageId.asc().nullsLast(),
    ),
  ],
)
