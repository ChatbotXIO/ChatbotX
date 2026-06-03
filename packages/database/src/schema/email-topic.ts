import { index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const emailTopicModel = pgTable(
  "EmailTopic",
  {
    ...sharedColumns,
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    folderId: bigintAsString().references(() => folderModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    sendsTotal: integer().default(0).notNull(),
    deliveredsTotal: integer().default(0).notNull(),
    // deduped unique counts: each EmailTopicRecipient row contributes at most 1
    seensTotal: integer().default(0).notNull(),
    clicksTotal: integer().default(0).notNull(),
  },
  (table) => [
    uniqueIndex("EmailTopic_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
    index("EmailTopic_folderId_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
  ],
)
