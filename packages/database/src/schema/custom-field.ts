import { jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { type CustomFieldType, customFieldTypes } from "../partials"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const customFieldType = pgEnum(
  "customFieldType",
  customFieldTypes.options as [string, ...string[]],
)

export const customFieldModel = pgTable(
  "CustomField",
  {
    ...sharedColumns,
    name: text().notNull(),
    type: customFieldType().$type<CustomFieldType>().notNull(),
    description: text(),
    folderId: bigintAsString().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // Visibilidade 3-state (alwaysShow/alwaysHide/hideWhenEmpty) — paridade
    // Respond.io. Substitui o boolean showInInbox legado (migration backfill).
    visibility: text().default("alwaysShow").notNull(),
    // Para type="list" — opções pré-definidas pelo admin (multi-select).
    // Outros tipos ignoram esse campo.
    values: jsonb().$type<string[]>().default([]).notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("CustomField_workspaceId_type_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.type.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)
