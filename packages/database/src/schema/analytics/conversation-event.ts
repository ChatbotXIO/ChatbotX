import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { analyticsConversationEventTypes } from "../../partials/analytics-events"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { workspaceModel } from "../workspace"

export const analyticsConversationEventTypeEnum = pgEnum(
  "analyticsConversationEventType",
  analyticsConversationEventTypes.options as [string, ...string[]],
)

export const analyticsConversationEventModel = pgTable(
  "AnalyticsConversationEvent",
  {
    eventId: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
    conversationId: bigintAsString().notNull(),
    eventType: analyticsConversationEventTypeEnum().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    fromAssignee: bigintAsString(),
    toAssignee: bigintAsString(),
    channel: text(),
    metadata: jsonb(),
    insertedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.occurredAt, table.eventId] }),
    index("AnalyticsConversationEvent_workspaceId_occurredAt_eventType_idx").on(
      table.workspaceId,
      table.occurredAt,
      table.eventType,
    ),
    index(
      "AnalyticsConversationEvent_workspaceId_toAssignee_occurredAt_idx",
    ).on(table.workspaceId, table.toAssignee, table.occurredAt),
  ],
)
