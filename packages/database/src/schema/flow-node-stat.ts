import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
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
    failedAt: timestamp(timestampConfig),
    deliveredAt: timestamp(timestampConfig),
    seenAt: timestamp(timestampConfig),
    clickedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("FlowNodeStat_contactInboxId_seenAt_idx").on(
      table.contactInboxId,
      table.seenAt,
    ),
    index("FlowNodeStat_analyticsId_nodeId_idx").on(
      table.analyticsId,
      table.nodeId,
    ),
    uniqueIndex("FlowNodeStat_analyticsId_nodeId_contactId_key").on(
      table.analyticsId,
      table.nodeId,
      table.contactId,
    ),
  ],
)
