import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { workspaceModel } from "../workspace"

export const analyticsFlowNodeEventModel = pgTable(
  "AnalyticsFlowNodeEvent",
  {
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
    flowId: bigintAsString().notNull(),
    analyticsId: bigintAsString().notNull(),
    nodeId: text().notNull(),
    buttonId: text().notNull().default(""),
    contactInboxId: bigintAsString().notNull(),
    eventType: text().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    insertedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.flowId,
        table.analyticsId,
        table.nodeId,
        table.buttonId,
        table.contactInboxId,
        table.eventType,
        table.occurredAt,
      ],
    }),
    index(
      "AnalyticsFlowNodeEvent_workspaceId_flowId_analyticsId_nodeId_occurredAt_idx",
    ).on(
      table.workspaceId,
      table.flowId,
      table.analyticsId,
      table.nodeId,
      table.occurredAt,
    ),
    index(
      "AnalyticsFlowNodeEvent_workspaceId_flowId_analyticsId_nodeId_buttonId_occurredAt_idx",
    ).on(
      table.workspaceId,
      table.flowId,
      table.analyticsId,
      table.nodeId,
      table.buttonId,
      table.occurredAt,
    ),
  ],
)
