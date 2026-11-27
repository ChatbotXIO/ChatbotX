import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  vector,
} from "drizzle-orm/pg-core"
import { aiEmbeddingStatuses } from "../partials"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { aiFileModel } from "./ai-file"
import { workspaceModel } from "./workspace"

export const aiEmbeddingStatus = pgEnum(
  "aiEmbeddingStatus",
  aiEmbeddingStatuses.options as [string, ...string[]],
)

export const aiEmbeddingModel = pgTable(
  "AIEmbedding",
  {
    ...sharedColumns,
    content: text().notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    status: aiEmbeddingStatus().default("pending").notNull(),
    // Position of the chunk in the document (0-based). NULL = row written
    // before positions were stored; reindexing the file fills it in.
    chunkIndex: integer(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    aiFileId: bigintAsString()
      .notNull()
      .references(() => aiFileModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("AIEmbedding_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("AIEmbedding_aiFileId_chunkIndex_idx").using(
      "btree",
      table.aiFileId.asc().nullsLast(),
      table.chunkIndex.asc().nullsLast(),
    ),
  ],
)
