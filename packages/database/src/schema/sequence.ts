import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials/shared"
import { chatbotModel } from "./chatbot"
import { contactModel } from "./contact"
import { flowModel } from "./flow"
import { folderModel } from "./folder"

export const sequenceModel = pgTable(
  "sequences",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    folderId: bigint("folder_id", { mode: "bigint" }).references(
      () => folderModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    active: boolean("active").notNull().default(true),
    subscribers: integer("subscribers").notNull().default(0),
    messages: integer("messages").notNull().default(0),
    openRate: doublePrecision("open_rate").notNull().default(0),
    ctr: doublePrecision("ctr").notNull().default(0),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("sequences_folder_id_idx").on(table.folderId),
    uniqueIndex("sequences_chatbot_id_name_key").on(
      table.chatbotId,
      table.name,
    ),
  ],
)

export const sequenceStepModel = pgTable(
  "sequence_steps",
  {
    ...sharedColumns,
    order: integer("order").notNull(),
    delayDays: integer("delay_days").notNull(),
    delayMinutes: integer("delay_minutes").notNull().default(0),
    delayUnit: text("delay_unit").default("days"),
    specificDateTime: timestamp("specific_date_time", timestampConfig),
    isActive: boolean("is_active").notNull().default(true),
    anytime: boolean("anytime").notNull().default(true),
    sendTimeStart: text("send_time_start"),
    sendTimeEnd: text("send_time_end"),
    sendDays: text("send_days").default(
      '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]',
    ),
    flowId: bigint("flow_id", { mode: "bigint" }).references(
      () => flowModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    sequenceId: bigint("sequence_id", { mode: "bigint" })
      .notNull()
      .references(() => sequenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("sequence_steps_sequence_id_idx").on(table.sequenceId),
    index("sequence_steps_flow_id_idx").on(table.flowId),
  ],
)

export const contactsOnSequenceModel = pgTable(
  "contacts_on_sequences",
  {
    ...sharedColumns,
    enrolledAt: timestamp("enrolled_at", timestampConfig)
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", timestampConfig),
    currentStep: integer("current_step").notNull().default(0),
    status: text("status").notNull().default("active"),
    nextRunAt: timestamp("next_run_at", timestampConfig),
    lastStepId: bigint("last_step_id", { mode: "bigint" }),
    nextStepId: bigint("next_step_id", { mode: "bigint" }),
    lockedAt: timestamp("locked_at", timestampConfig),
    lockOwner: text("lock_owner"),
    errorCount: integer("error_count").notNull().default(0),
    lastError: text("last_error"),
    contactId: bigint("contact_id", { mode: "bigint" })
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sequenceId: bigint("sequence_id", { mode: "bigint" })
      .notNull()
      .references(() => sequenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("contacts_on_sequences_sequence_id_idx").on(table.sequenceId),
    index("contacts_on_sequences_contact_id_idx").on(table.contactId),
    index("contacts_on_sequences_chatbot_id_idx").on(table.chatbotId),
    index("contacts_on_sequences_status_next_run_at_idx").on(
      table.status,
      table.nextRunAt,
    ),
    index("contacts_on_sequences_chatbot_id_status_next_run_at_idx").on(
      table.chatbotId,
      table.status,
      table.nextRunAt,
    ),
    uniqueIndex(
      "contacts_on_sequences_contact_id_sequence_id_chatbot_id_key",
    ).on(table.contactId, table.sequenceId, table.chatbotId),
  ],
)

export const sequenceEventModel = pgTable(
  "sequence_events",
  {
    ...sharedColumns,
    occurredAt: timestamp("occurred_at", timestampConfig)
      .notNull()
      .defaultNow(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload"),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sequenceId: bigint("sequence_id", { mode: "bigint" })
      .notNull()
      .references(() => sequenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigint("contact_id", { mode: "bigint" })
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    stepId: bigint("step_id", { mode: "bigint" })
      .notNull()
      .references(() => sequenceStepModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    dispatchId: bigint("dispatch_id", { mode: "bigint" }).references(
      () => sequenceDispatchModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
  },
  (table) => [
    index("sequence_events_chatbot_id_occurred_at_idx").on(
      table.chatbotId,
      table.occurredAt,
    ),
    index("sequence_events_contact_id_occurred_at_idx").on(
      table.contactId,
      table.occurredAt,
    ),
    index("sequence_events_sequence_id_event_type_idx").on(
      table.sequenceId,
      table.eventType,
    ),
  ],
)

export const sequenceDispatchModel = pgTable(
  "sequence_dispatches",
  {
    ...sharedColumns,
    runAtMs: bigint("run_at_ms", { mode: "number" }).notNull().default(0),
    bucket: integer("bucket").notNull().default(0),
    status: text("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    attempt: integer("attempt").notNull().default(0),
    lastError: text("last_error"),
    lockedAt: timestamp("locked_at", timestampConfig),
    lockOwner: text("lock_owner"),
    completedAt: timestamp("completed_at", timestampConfig),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sequenceId: bigint("sequence_id", { mode: "bigint" })
      .notNull()
      .references(() => sequenceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigint("contact_id", { mode: "bigint" })
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    stepId: bigint("step_id", { mode: "bigint" })
      .notNull()
      .references(() => sequenceStepModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    enrollmentId: bigint("enrollment_id", { mode: "bigint" })
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
    index("SequenceDispatch_chatbotId_status_runAtMs_idx").on(
      table.chatbotId,
      table.status,
      table.runAtMs,
    ),
    uniqueIndex("SequenceDispatch_idempotencyKey_key").on(
      table.idempotencyKey,
      table.chatbotId,
    ),
    index("SequenceDispatch_enrollmentId_idx").on(table.enrollmentId),
    index("SequenceDispatch_bucket_status_runAtMs_idx").on(
      table.bucket,
      table.status,
      table.runAtMs,
    ),
  ],
)
