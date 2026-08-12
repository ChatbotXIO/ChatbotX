import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { inboxModel } from "./inbox"
import { workspaceModel } from "./workspace"

export const integrationThreadsModel = pgTable(
  "IntegrationThreads",
  {
    ...sharedColumns,
    auth: jsonb().notNull(),
    threadsUserId: text().notNull(),
    username: text().notNull(),
    name: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigintAsString()
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("IntegrationThreads_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationThreads_inboxId_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("IntegrationThreads_threadsUserId_key").using(
      "btree",
      table.threadsUserId.asc().nullsLast(),
    ),
  ],
)
