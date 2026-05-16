import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { analyticsMessageEventTypes } from "../../partials/analytics-events"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { workspaceModel } from "../workspace"
import { analyticsContactSenderTypeEnum } from "./contact-event"

export const analyticsMessageEventTypeEnum = pgEnum(
  "analyticsMessageEventType",
  analyticsMessageEventTypes.options as [string, ...string[]],
)

export const analyticsMessageEventModel = pgTable(
  "AnalyticsMessageEvent",
  {
    eventId: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
    contactId: bigintAsString().notNull(),
    eventType: analyticsMessageEventTypeEnum().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    senderType: analyticsContactSenderTypeEnum(),
    adminId: bigintAsString(),
    channel: text(),
    source: text(),
    sourceId: text(),
    metadata: jsonb(),
    insertedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.occurredAt, table.eventId] }),
    index("AnalyticsMessageEvent_workspaceId_occurredAt_eventType_idx").on(
      table.workspaceId,
      table.occurredAt,
      table.eventType,
    ),
    index("AnalyticsMessageEvent_workspaceId_eventType_occurredAt_idx").on(
      table.workspaceId,
      table.eventType,
      table.occurredAt,
    ),
    index("AnalyticsMessageEvent_workspaceId_adminId_occurredAt_idx").on(
      table.workspaceId,
      table.adminId,
      table.occurredAt,
    ),
    index("AnalyticsMessageEvent_workspaceId_senderType_occurredAt_idx").on(
      table.workspaceId,
      table.senderType,
      table.occurredAt,
    ),
  ],
)
