import { createId } from "@chatbotx.io/utils"
import { type SQL, sql } from "drizzle-orm"
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { contactModel } from "./contact"
import { contactInboxModel } from "./contact-inbox"
import { contactsOnSequenceModel } from "./contact-on-sequence"
import { sequenceModel } from "./sequence"
import { sequenceStepModel } from "./sequence-step"
import { workspaceModel } from "./workspace"

export const sequenceDispatchModel = pgTable(
  "SequenceDispatch",
  {
    id: bigintAsString()
      .$defaultFn(() => createId())
      .notNull(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    updatedAt: timestamp(timestampConfig)
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
    runAtMs: bigintAsString().notNull(),
    bucket: integer().notNull().default(0),
    status: text().notNull().default("pending"),
    idempotencyKey: text().notNull(),
    attempt: integer().notNull().default(0),
    lastError: text(),
    lockedAt: timestamp(timestampConfig),
    lockOwner: text(),
    completedAt: timestamp(timestampConfig),
    deliveredAt: timestamp(timestampConfig),
    seenAt: timestamp(timestampConfig),
    clickedAt: timestamp(timestampConfig),
    failedAt: timestamp(timestampConfig),
    errorContent: text(),
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
    enrollmentId: bigintAsString().notNull(),
    isRead: boolean().generatedAlwaysAs(
      (): SQL =>
        sql`case when "seenAt" is null then false when "deliveredAt" is null then false else "seenAt" >= "deliveredAt" end`,
    ),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.workspaceId],
      name: "SequenceDispatch_pkey",
    }),
    uniqueIndex("SequenceDispatch_idempotencyKey_key").on(
      table.idempotencyKey,
      table.workspaceId,
    ),
    foreignKey({
      columns: [table.enrollmentId, table.workspaceId],
      foreignColumns: [
        contactsOnSequenceModel.id,
        contactsOnSequenceModel.workspaceId,
      ],
      name: "SequenceDispatch_enrollment_workspace_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("SequenceDispatch_id_idx").on(table.id),
    index("SequenceDispatch_pending_runAtMs_idx")
      .on(table.runAtMs)
      .where(sql`"status" = 'pending'`),
    index("SequenceDispatch_pending_bucket_runAtMs_idx")
      .on(table.bucket, table.runAtMs)
      .where(sql`"status" = 'pending'`),
    index("SequenceDispatch_status_runAtMs_idx").on(
      table.status,
      table.runAtMs,
    ),
    index("SequenceDispatch_workspaceId_status_runAtMs_idx").on(
      table.workspaceId,
      table.status,
      table.runAtMs,
    ),
    index("SequenceDispatch_enrollmentId_workspaceId_idx").on(
      table.enrollmentId,
      table.workspaceId,
    ),
    index("SequenceDispatch_workspace_sequence_step_id_idx").on(
      table.workspaceId,
      table.sequenceId,
      table.stepId,
      table.id,
    ),
    index("SequenceDispatch_bucket_status_runAtMs_idx").on(
      table.bucket,
      table.status,
      table.runAtMs,
    ),
    index("SequenceDispatch_terminal_updatedAt_idx")
      .on(table.updatedAt)
      .where(sql`"status" in ('completed', 'failed', 'canceled')`),
    index("SequenceDispatch_contactId_idx").on(table.contactId),
  ],
)
