import { boolean, index, pgTable, text } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const webhookModel = pgTable(
  "Webhook",
  {
    ...sharedColumns,
    name: text().notNull(),
    active: boolean().notNull().default(true),
    folderId: bigintAsString().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    url: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("Webhook_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Webhook_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
    index("Webhook_workspaceId_active_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.active.asc().nullsLast(),
    ),
  ],
)
