import { sql } from "drizzle-orm"
import { boolean, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core"
import { folderTypes } from "../partials"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const folderType = pgEnum(
  "folderType",
  folderTypes.options as [string, ...string[]],
)

export const folderModel = pgTable(
  "Folder",
  {
    ...sharedColumns,
    name: text().notNull(),
    folderType: folderType().notNull(),
    parentId: bigintAsString(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    isTrash: boolean().default(false).notNull(),
    paths: bigintAsString().array().notNull().default(sql`[]`),
  },
  (table) => [
    index("Folder_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Folder_parentId_idx").using(
      "btree",
      table.parentId.asc().nullsLast(),
    ),
  ],
)
