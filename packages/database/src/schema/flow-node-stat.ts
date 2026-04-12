import { sql } from "drizzle-orm"
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { workspaceModel } from "./workspace"

export const flowNodeStatModel = pgTable(
  "FlowNodeStat",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigintAsString().notNull(),
    analyticsId: bigintAsString().notNull(),
    nodeId: text().notNull(),
    buttonId: text(),
    contactId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    eventType: text().notNull(),
    errorContent: text(),
    occurredAt: timestamp(timestampConfig),
    seenAt: timestamp(timestampConfig),
    refId: text(),
    refType: integer(),
  },
  (table) => [
    index("FlowNodeStat_filter_1_idx").on(
      table.workspaceId,
      table.analyticsId,
      table.nodeId,
      table.eventType,
      table.buttonId,
    ),
    index("FlowNodeStat_filter_2_idx")
      .on(table.workspaceId, table.analyticsId, table.nodeId)
      .where(sql`${table.eventType} = 'seen' AND ${table.seenAt} IS NOT NULL`),
  ],
)
