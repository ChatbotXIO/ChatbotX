import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const triggerModel = pgTable(
  "Trigger",
  {
    ...sharedColumns,
    name: text().notNull(),
    active: boolean().notNull().default(true),
    folderId: bigintAsString().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    actions: jsonb().array().notNull().default(sql`[]`),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("Trigger_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
    index("Trigger_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Trigger_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
    index("Trigger_workspaceId_active_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.active.asc().nullsLast(),
    ),
  ],
)
