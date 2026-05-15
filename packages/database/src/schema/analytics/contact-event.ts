import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  analyticsContactEventTypes,
  analyticsContactSenderTypes,
} from "../../partials/analytics-events"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { workspaceModel } from "../workspace"

export const analyticsContactEventTypeEnum = pgEnum(
  "analyticsContactEventType",
  analyticsContactEventTypes.options as [string, ...string[]],
)

export const analyticsContactSenderTypeEnum = pgEnum(
  "analyticsContactSenderType",
  analyticsContactSenderTypes.options as [string, ...string[]],
)

export const analyticsContactEventModel = pgTable(
  "AnalyticsContactEvent",
  {
    eventId: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
    contactId: bigintAsString().notNull(),
    eventType: analyticsContactEventTypeEnum().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    source: text(),
    sourceId: text(),
    channel: text(),
    country: text(),
    senderType: analyticsContactSenderTypeEnum(),
    adminId: bigintAsString(),
    metadata: jsonb(),
    insertedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.occurredAt, table.eventId] }),
    index("AnalyticsContactEvent_workspaceId_occurredAt_eventType_idx").on(
      table.workspaceId,
      table.occurredAt,
      table.eventType,
    ),
    index("AnalyticsContactEvent_workspaceId_eventType_occurredAt_idx").on(
      table.workspaceId,
      table.eventType,
      table.occurredAt,
    ),
    index("AnalyticsContactEvent_workspaceId_adminId_occurredAt_idx").on(
      table.workspaceId,
      table.adminId,
      table.occurredAt,
    ),
  ],
)
