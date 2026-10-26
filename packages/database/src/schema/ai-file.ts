import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import type {
  AIFileChunking,
  AIFileChunkingConfig,
  AIFileProcessingRun,
} from "../partials/ai"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const aiFileModel = pgTable(
  "AIFile",
  {
    ...sharedColumns,
    name: text().notNull(),
    path: text().notNull(),
    size: integer().notNull(),
    mimeType: text().notNull(),
    chunking: jsonb().$type<AIFileChunking>(),
    chunkingConfig: jsonb().$type<AIFileChunkingConfig>(),
    processingRun: jsonb().$type<AIFileProcessingRun>(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [index("AIFile_workspaceId_idx").on(table.workspaceId)],
)
