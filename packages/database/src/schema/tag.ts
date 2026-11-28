import { isNull } from "drizzle-orm"
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const tagModel = pgTable(
  "Tag",
  {
    ...sharedColumns,
    name: text().notNull(),
    /** `#RRGGBB`, or null for the default (uncolored) look. */
    color: text(),
    deletedAt: timestamp(timestampConfig),
    folderId: bigintAsString().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("Tag_workspaceId_name_key")
      .using(
        "btree",
        table.workspaceId.asc().nullsLast(),
        table.name.asc().nullsLast(),
      )
      .where(isNull(table.deletedAt)),
    index("Tag_folderId_idx").using("btree", table.folderId.asc().nullsLast()),
  ],
)
