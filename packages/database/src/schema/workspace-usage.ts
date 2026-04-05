import { integer, pgTable, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const workspaceUsageModel = pgTable(
  "WorkspaceUsage",
  {
    ...sharedColumns,
    contactsCount: integer().default(0).notNull(),
    maxContacts: integer().default(0).notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("WorkspaceUsage_workspaceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
