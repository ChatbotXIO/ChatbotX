import {
  index,
  integer,
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
import { contactModel } from "./contact"
import { sequenceModel } from "./sequence"
import { workspaceModel } from "./workspace"

export const contactsOnSequenceModel = pgTable(
  "ContactOnSequence",
  {
    ...sharedColumns,
    enrolledAt: timestamp(timestampConfig).notNull().defaultNow(),
    completedAt: timestamp(timestampConfig),
    currentStep: integer().notNull().default(0),
    status: text(),
    nextRunAt: timestamp(timestampConfig),
    lastStepId: bigintAsString(),
    nextStepId: bigintAsString(),
    lockedAt: timestamp(timestampConfig),
    lockOwner: text(),
    errorCount: integer().notNull().default(0),
    lastError: text(),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sequenceId: bigintAsString()
      .notNull()
      .references(() => sequenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("ContactsOnSequence_sequenceId_idx").on(table.sequenceId),
    index("ContactsOnSequence_contactId_idx").on(table.contactId),
    index("ContactsOnSequence_workspaceId_idx").on(table.workspaceId),
    index("ContactsOnSequence_status_nextRunAt_idx").on(
      table.status,
      table.nextRunAt,
    ),
    index("ContactsOnSequence_workspaceId_status_nextRunAt_idx").on(
      table.workspaceId,
      table.status,
      table.nextRunAt,
    ),
    uniqueIndex("ContactsOnSequence_contactId_sequenceId_workspaceId_key").on(
      table.contactId,
      table.sequenceId,
      table.workspaceId,
    ),
  ],
)
