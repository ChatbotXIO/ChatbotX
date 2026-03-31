import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { chatbotModel } from "./chatbot"
import { contactModel } from "./contact"
import { folderModel } from "./folder"
import { sharedColumns, timestampConfig } from "./shared"

export const triggerModel = pgTable(
  "triggers",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    folderId: bigint("folder_id", { mode: "bigint" }).references(
      () => folderModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    actions: jsonb("actions").notNull().default(sql`'[]'`),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("triggers_chatbot_id_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
    index("triggers_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("triggers_folder_id_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
    index("triggers_chatbot_id_active_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.active.asc().nullsLast(),
    ),
  ],
)

export const webhookModel = pgTable(
  "webhooks",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    folderId: bigint("folder_id", { mode: "bigint" }).references(
      () => folderModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    url: text("url").notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("webhooks_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("webhooks_folder_id_idx").using(
      "btree",
      table.folderId.asc().nullsLast(),
    ),
    index("webhooks_chatbot_id_active_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.active.asc().nullsLast(),
    ),
  ],
)

export const conditionModel = pgTable(
  "conditions",
  {
    ...sharedColumns,
    triggerId: bigint("trigger_id", { mode: "bigint" }).references(
      () => triggerModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    webhookId: bigint("webhook_id", { mode: "bigint" }).references(
      () => webhookModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    type: integer("type").notNull(),
    sourceId: text("source_id"),
    operator: varchar("operator", { length: 255 }),
    value: jsonb("value"),
  },
  (table) => [
    index("conditions_type_source_id_idx").using(
      "btree",
      table.type.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
    index("conditions_trigger_id_idx").using(
      "btree",
      table.triggerId.asc().nullsLast(),
    ),
    index("conditions_webhook_id_idx").using(
      "btree",
      table.webhookId.asc().nullsLast(),
    ),
    index("conditions_type_source_id_trigger_id_idx").using(
      "btree",
      table.type.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
      table.triggerId.asc().nullsLast(),
    ),
    index("conditions_type_source_id_webhook_id_idx").using(
      "btree",
      table.type.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
      table.webhookId.asc().nullsLast(),
    ),
  ],
)

export const triggerStatsModel = pgTable(
  "trigger_stats",
  {
    ...sharedColumns,
    triggerId: bigint("trigger_id", { mode: "bigint" })
      .notNull()
      .references(() => triggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    date: timestamp("date", timestampConfig).notNull(),
    totalContacts: integer("total_contacts").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    totalExecutions: integer("total_executions").notNull().default(0),
  },
  (table) => [
    uniqueIndex("trigger_stats_trigger_id_date_key").using(
      "btree",
      table.triggerId.asc().nullsLast(),
      table.date.asc().nullsLast(),
    ),
    index("trigger_stats_trigger_id_date_idx").using(
      "btree",
      table.triggerId.asc().nullsLast(),
      table.date.asc().nullsLast(),
    ),
    index("trigger_stats_chatbot_id_date_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.date.asc().nullsLast(),
    ),
  ],
)

export const triggerContactHistoryModel = pgTable(
  "trigger_contact_histories",
  {
    ...sharedColumns,
    triggerId: bigint("trigger_id", { mode: "bigint" })
      .notNull()
      .references(() => triggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigint("contact_id", { mode: "bigint" })
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    firstEnteredAt: timestamp("first_entered_at", timestampConfig).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.id, table.contactId],
      name: "trigger_contact_histories_pkey",
    }),
    index("trigger_contact_histories_trigger_id_contact_id_idx").using(
      "btree",
      table.triggerId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
    ),
    index("trigger_contact_histories_contact_id_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
    ),
    index("trigger_contact_histories_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
  ],
)

export const triggerExecutionModel = pgTable(
  "trigger_executions",
  {
    ...sharedColumns,
    executedAt: timestamp("executed_at", timestampConfig)
      .defaultNow()
      .notNull(),
    triggerId: bigint("trigger_id", { mode: "bigint" })
      .notNull()
      .references(() => triggerModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigint("contact_id", { mode: "bigint" })
      .notNull()
      .references(() => contactModel.id, {
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
    index("trigger_executions_trigger_id_contact_id_idx").using(
      "btree",
      table.triggerId.asc().nullsLast(),
      table.contactId.asc().nullsLast(),
    ),
    index("trigger_executions_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
  ],
)
