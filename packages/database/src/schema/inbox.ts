import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const inboxModel = pgTable(
  "Inbox",
  {
    ...sharedColumns,
    name: text().notNull(),
    channel: text().notNull(),
    sourceId: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    status: text().notNull().default("connected"),
  },
  (table) => [
    index("Inbox_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("Inbox_channel_sourceId_key").using(
      "btree",
      table.channel.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
  ],
)
