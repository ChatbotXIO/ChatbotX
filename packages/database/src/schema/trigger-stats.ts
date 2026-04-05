import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { triggerModel } from "./trigger"
import { workspaceModel } from "./workspace"

export const triggerStatsModel = pgTable(
  "TriggerStat",
  {
    ...sharedColumns,
    triggerId: bigintAsString()
      .notNull()
      .references(() => triggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    date: timestamp(timestampConfig).notNull(),
    totalContacts: integer().notNull().default(0),
    successCount: integer().notNull().default(0),
    failureCount: integer().notNull().default(0),
    totalExecutions: integer().notNull().default(0),
  },
  (table) => [
    uniqueIndex("TriggerStat_triggerId_date_key").using(
      "btree",
      table.triggerId.asc().nullsLast(),
      table.date.asc().nullsLast(),
    ),
    index("TriggerStat_triggerId_date_idx").using(
      "btree",
      table.triggerId.asc().nullsLast(),
      table.date.asc().nullsLast(),
    ),
    index("TriggerStat_workspaceId_date_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.date.asc().nullsLast(),
    ),
  ],
)
