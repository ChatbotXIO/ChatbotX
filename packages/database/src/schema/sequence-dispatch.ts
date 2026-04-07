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
import { contactInboxModel } from "./contact-inbox"
import { contactsOnSequenceModel } from "./contact-on-sequence"
import { sequenceModel } from "./sequence"
import { sequenceStepModel } from "./sequence-step"
import { workspaceModel } from "./workspace"

export const sequenceDispatchModel = pgTable(
  "SequenceDispatch",
  {
    ...sharedColumns,
    runAtMs: bigintAsString().notNull(),
    bucket: integer().notNull().default(0),
    status: text(),
    idempotencyKey: text().notNull(),
    attempt: integer().notNull().default(0),
    lastError: text(),
    lockedAt: timestamp(timestampConfig),
    lockOwner: text(),
    completedAt: timestamp(timestampConfig),
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
    contactInboxId: bigintAsString()
      .notNull()
      .references(() => contactInboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    stepId: bigintAsString()
      .notNull()
      .references(() => sequenceStepModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    enrollmentId: bigintAsString()
      .notNull()
      .references(() => contactsOnSequenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("SequenceDispatch_status_runAtMs_idx").on(
      table.status,
      table.runAtMs,
    ),
    index("SequenceDispatch_workspaceId_status_runAtMs_idx").on(
      table.workspaceId,
      table.status,
      table.runAtMs,
    ),
    uniqueIndex("SequenceDispatch_idempotencyKey_key").on(
      table.idempotencyKey,
      table.workspaceId,
    ),
    index("SequenceDispatch_enrollmentId_idx").on(table.enrollmentId),
    index("SequenceDispatch_bucket_status_runAtMs_idx").on(
      table.bucket,
      table.status,
      table.runAtMs,
    ),
  ],
)
