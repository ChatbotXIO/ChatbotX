import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { importFormats, importStatuses, importTypes } from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { fileModel } from "./file"
import { workspaceModel } from "./workspace"

export const importType = pgEnum(
  "importType",
  importTypes.options as [string, ...string[]],
)
export const importFormat = pgEnum(
  "importFormat",
  importFormats.options as [string, ...string[]],
)
export const importStatus = pgEnum(
  "importStatus",
  importStatuses.options as [string, ...string[]],
)

export const importModel = pgTable(
  "Import",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    fileId: bigintAsString()
      .notNull()
      .references(() => fileModel.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    type: importType().notNull(),
    format: importFormat().notNull(),
    status: importStatus().notNull(),
    meta: jsonb().notNull(),
    totalCount: integer().default(0).notNull(),
    processedCount: integer().default(0).notNull(),
    successCount: integer().default(0).notNull(),
    failedCount: integer().default(0).notNull(),
    errorMessage: text(),
    completedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("Import_workspaceId_status_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    index("Import_workspaceId_type_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.type.asc().nullsLast(),
    ),
    index("Import_fileId_idx").using("btree", table.fileId.asc().nullsLast()),
  ],
)
