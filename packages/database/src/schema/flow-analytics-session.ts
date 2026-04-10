import { sql } from "drizzle-orm"
import { index, pgTable, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns, timestampConfig } from "../partials"

export const flowAnalyticsSessionModel = pgTable(
  "FlowAnalyticsSession",
  {
    ...sharedColumns,
    flowId: bigintAsString().notNull(),
    workspaceId: bigintAsString().notNull(),
    deletedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("FlowAnalyticsSession_workspaceId_flowId_key")
      .using(
        "btree",
        table.flowId.asc().nullsLast(),
        table.workspaceId.asc().nullsLast(),
      )
      .where(sql`${table.deletedAt} IS NULL`),
    index("FlowAnalyticsSession_flowId_idx").using(
      "btree",
      table.flowId.asc().nullsLast(),
    ),
  ],
)
