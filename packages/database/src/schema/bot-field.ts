import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { customFieldType } from "./custom-field"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const botFieldModel = pgTable(
  "BotField",
  {
    ...sharedColumns,
    name: text().notNull(),
    type: customFieldType("type").notNull(),
    value: text(),
    description: text(),
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
    uniqueIndex("BotField_workspaceId_type_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.type.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)
