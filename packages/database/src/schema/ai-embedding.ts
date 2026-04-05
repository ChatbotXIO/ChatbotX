import { index, pgEnum, pgTable, text, vector } from "drizzle-orm/pg-core"
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
  ],
)
