import { boolean, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import type { DynamicImageDocument } from "../partials/dynamic-image"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { customFieldModel } from "./custom-field"
import { workspaceModel } from "./workspace"

export const dynamicImageModel = pgTable(
  "DynamicImage",
  {
    ...sharedColumns,
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    customFieldId: bigintAsString().references(() => customFieldModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    data: jsonb().$type<DynamicImageDocument>().notNull(),
    backgroundUrl: text(),
    enabled: boolean().default(true).notNull(),
  },
  (table) => [
    uniqueIndex("DynamicImage_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)
