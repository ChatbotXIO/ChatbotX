import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { contactModel } from "./contact"
import { sequenceModel } from "./sequence"
import { sequenceDispatchModel } from "./sequence-dispatch"
import { sequenceStepModel } from "./sequence-step"
import { workspaceModel } from "./workspace"

export const sequenceEventModel = pgTable(
  "SequenceEvent",
  {
    ...sharedColumns,
    occurredAt: timestamp(timestampConfig).notNull().defaultNow(),
    eventType: text().notNull(),
    payload: jsonb(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sequenceId: bigintAsString()
      .notNull()
      .references(() => sequenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    stepId: bigintAsString()
      .notNull()
      .references(() => sequenceStepModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    dispatchId: bigintAsString().references(() => sequenceDispatchModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    index("SequenceEvent_workspaceId_occurredAt_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
    index("SequenceEvent_contactId_occurredAt_idx").on(
      table.contactId,
      table.occurredAt,
    ),
    index("SequenceEvent_sequenceId_eventType_idx").on(
      table.sequenceId,
      table.eventType,
    ),
  ],
)
