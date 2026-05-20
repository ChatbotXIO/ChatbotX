import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { fileContextTypes, fileStatuses } from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { workspaceModel } from "./workspace"

export type FileMeta = {
  totalRecords?: number
}

export const fileContextType = pgEnum(
  "fileContextType",
  fileContextTypes.options as [string, ...string[]],
)

export const fileStatus = pgEnum(
  "fileStatus",
  fileStatuses.options as [string, ...string[]],
)

export const fileModel = pgTable(
  "File",
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
    contextType: fileContextType().notNull(),
    subType: text(),
    path: text().notNull(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    fileSize: bigintAsString(),
    status: fileStatus().notNull().default("pending"),
    meta: jsonb().$type<FileMeta>(),
    uploadedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("File_path_key").on(table.path),
    index("File_workspaceId_contextType_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.contextType.asc().nullsLast(),
    ),
    index("File_workspaceId_subType_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.subType.asc().nullsLast(),
    ),
  ],
)
