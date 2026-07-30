import { sql } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type ContactImportMeta,
  type CouponImportMeta,
  type ImportFormat,
  type ImportStatus,
  type ImportType,
  importFormats,
  importStatuses,
  importTypes,
  type ProductImportMeta,
} from "../partials"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"
import { fileModel } from "./file"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const importType = pgEnum(
  "importType",
  importTypes.options as [ImportType, ...ImportType[]],
)
export const importFormat = pgEnum(
  "importFormat",
  importFormats.options as [ImportFormat, ...ImportFormat[]],
)
export const importStatus = pgEnum(
  "importStatus",
  importStatuses.options as [ImportStatus, ...ImportStatus[]],
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
    inboxId: bigintAsString().references(() => inboxModel.id, {
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
    meta: jsonb()
      .$type<ContactImportMeta | CouponImportMeta | ProductImportMeta>()
      .notNull(),
    totalCount: integer().default(0).notNull(),
    processedCount: integer().default(0).notNull(),
    successCount: integer().default(0).notNull(),
    failedCount: integer().default(0).notNull(),
    errorMessage: text(),
    errorSample: jsonb()
      .$type<Array<{ row: number; reason: string }>>()
      .default([])
      .notNull(),
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
    index("Import_inboxId_type_idx").using(
      "btree",
      table.inboxId.asc().nullsLast(),
      table.type.asc().nullsLast(),
    ),
    index("Import_fileId_idx").using("btree", table.fileId.asc().nullsLast()),
    uniqueIndex("Import_products_active_idx")
      .on(table.workspaceId)
      .where(
        sql`${table.type} = 'products' AND ${table.status} IN ('pending', 'processing')`,
      ),
  ],
)
