import { sql } from "drizzle-orm"
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials"
import { flowModel } from "./flow"
import { workspaceModel } from "./workspace"

export const flowAnalyticsSessionModel = pgTable(
  "FlowAnalyticsSession",
  {
    ...sharedColumns,
    flowId: text()
      .notNull()
      .references(() => flowModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "FlowAnalyticsSession_flowId_fkey",
      }),
    workspaceId: text()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
        name: "FlowAnalyticsSession_workspaceId_fkey",
      }),
    deletedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("FlowAnalyticsSession_workspaceId_chatbotId_key")
      .using(
        "btree",
        table.flowId.asc().nullsLast().op("text_ops"),
        table.workspaceId.asc().nullsLast().op("text_ops"),
      )
      .where(sql`${table.deletedAt} IS NULL`),
    index("FlowAnalyticsSession_flowId_idx").using(
      "btree",
      table.flowId.asc().nullsLast(),
    ),
  ],
)
