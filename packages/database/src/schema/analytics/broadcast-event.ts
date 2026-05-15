import { sql } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core"
import { analyticsBroadcastEventTypes } from "../../partials/analytics-events"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { workspaceModel } from "../workspace"

export const analyticsBroadcastEventTypeEnum = pgEnum(
  "analyticsBroadcastEventType",
  analyticsBroadcastEventTypes.options as [string, ...string[]],
)

export const analyticsBroadcastEventModel = pgTable(
  "AnalyticsBroadcastEvent",
  {
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
    broadcastId: bigintAsString().notNull(),
    contactInboxId: bigintAsString().notNull(),
    eventType: analyticsBroadcastEventTypeEnum().notNull(),
    batchId: bigintAsString().notNull().default(sql`1`),
    occurredAt: timestamp(timestampConfig).notNull(),
    insertedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.broadcastId,
        table.contactInboxId,
        table.batchId,
        table.eventType,
        table.occurredAt,
      ],
    }),
    index(
      "AnalyticsBroadcastEvent_workspaceId_broadcastId_eventType_occurredAt_idx",
    ).on(
      table.workspaceId,
      table.broadcastId,
      table.eventType,
      table.occurredAt,
    ),
  ],
)
