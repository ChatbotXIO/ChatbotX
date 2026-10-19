import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { workspaceModel } from "../workspace"

/** Timescale hypertable: one row per answered human-reply window. */
export const analyticsAgentResponseEventModel = pgTable(
  "AnalyticsAgentResponseEvent",
  {
    eventId: text().notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
    conversationId: bigintAsString().notNull(),
    contactId: bigintAsString().notNull(),
    adminId: bigintAsString().notNull(),
    /** Reply time. */
    occurredAt: timestamp(timestampConfig).notNull(),
    awaitingSince: timestamp(timestampConfig).notNull(),
    measuredFrom: timestamp(timestampConfig).notNull(),
    responseSeconds: integer().notNull(),
    workingResponseSeconds: integer(),
    isFirstResponse: boolean().notNull(),
    workingHoursId: bigintAsString(),
    /** Target of the window's SLA snapshot; NULL when no SLA applied. */
    slaTargetSeconds: integer(),
    /** Reply met the SLA deadline; NULL when no SLA applied. */
    slaMet: boolean(),
    channel: text(),
    inboxId: bigintAsString(),
    metadata: jsonb(),
    insertedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.occurredAt, table.eventId] }),
    index("AnalyticsAgentResponseEvent_workspaceId_occurredAt_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
  ],
)
