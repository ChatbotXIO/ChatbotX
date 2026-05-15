import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { workspaceModel } from "../workspace"

export const analyticsSequenceEventModel = pgTable(
  "AnalyticsSequenceEvent",
  {
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, { onDelete: "cascade" }),
    contactInboxId: bigintAsString().notNull(),
    eventType: text().notNull(),
    sequenceId: bigintAsString().notNull(),
    stepId: bigintAsString().notNull(),
    occurredAt: timestamp(timestampConfig).notNull(),
    insertedAt: timestamp(timestampConfig).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.sequenceId,
        table.stepId,
        table.contactInboxId,
        table.eventType,
        table.occurredAt,
      ],
    }),
    index(
      "AnalyticsSequenceEvent_workspaceId_sequenceId_stepId_eventType_occurredAt_idx",
    ).on(
      table.workspaceId,
      table.sequenceId,
      table.stepId,
      table.eventType,
      table.occurredAt,
    ),
  ],
)
