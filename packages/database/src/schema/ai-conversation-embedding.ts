import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core"
import { aiEmbeddingStatuses } from "../partials"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { aiConversationSourceModel } from "./ai-conversation-source"
import { conversationModel } from "./conversation"
import { workspaceModel } from "./workspace"

export const aiConversationEmbeddingStatus = pgEnum(
  "aiConversationEmbeddingStatus",
  aiEmbeddingStatuses.options as [string, ...string[]],
)

export const aiConversationEmbeddingModel = pgTable(
  "AIConversationEmbedding",
  {
    ...sharedColumns,
    sourceId: bigintAsString()
      .notNull()
      .references(() => aiConversationSourceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
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
    chunkIndex: integer().notNull(),
    content: text().notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    status: aiConversationEmbeddingStatus().default("pending").notNull(),
    errorMessage: text(),
  },
  (table) => [
    index("AIConversationEmbedding_lookup_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.conversationId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    uniqueIndex("AIConversationEmbedding_sourceId_chunkIndex_key").on(
      table.sourceId,
      table.chunkIndex,
    ),
  ],
)
