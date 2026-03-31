import {
  bigint,
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { userModel } from "./auth"
import { chatbotModel } from "./chatbot"
import { folderModel } from "./folder"
import { sharedColumns, timestampConfig } from "./shared"

export const gender = pgEnum("Gender", ["male", "female", "unknown"])

export const customFieldType = pgEnum("CustomFieldType", [
  "shortText",
  "number",
  "date",
  "datetime",
  "boolean",
  "longText",
])

export const contactModel = pgTable(
  "contacts",
  {
    ...sharedColumns,
    avatar: text("avatar"),
    phoneNumber: text("phone_number"),
    email: text("email"),
    emailVerified: boolean("email_verified").default(false).notNull(),
    emailOptIn: boolean("email_opt_in").default(false).notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    gender: gender("gender").notNull(),
    channel: text("channel").notNull(),
    lastReadAt: timestamp("last_read_at", timestampConfig),
    source: text("source"),
    ref: text("ref"),
    country: text("country"),
    state: text("state"),
    city: text("city"),
    location: jsonb("location").$type<{
      latitude: number
      longitude: number
    }>(),
    locale: text("locale"),
    timezone: text("timezone"),
    subscribedAt: timestamp("subscribed_at", timestampConfig),
    sourceId: text("source_id"),
    blockedAt: timestamp("blocked_at", timestampConfig),
    enableBroadcast: boolean("enable_broadcast").default(false).notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("contacts_chatbot_id_source_id_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
  ],
)

export const contactCustomFieldModel = pgTable(
  "contact_custom_fields",
  {
    ...sharedColumns,
    value: text("value").notNull(),
    contactId: bigint("contact_id", { mode: "bigint" })
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    customFieldId: bigint("custom_field_id", { mode: "bigint" })
      .notNull()
      .references(() => customFieldModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("contact_custom_fields_contact_id_custom_field_id_key").using(
      "btree",
      table.contactId.asc().nullsLast(),
      table.customFieldId.asc().nullsLast(),
    ),
  ],
)

export const contactInboxModel = pgTable(
  "contact_inboxes",
  {
    contactId: text("contact_id").notNull(),
    inboxId: text("inbox_id").notNull(),
    createdAt: sharedColumns.createdAt,
    updatedAt: sharedColumns.updatedAt,
    chatbotId: text("chatbot_id").notNull(),
    sourceId: text("source_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.contactId, table.inboxId],
      name: "contact_inboxes_pkey",
    }),
  ],
)

export const contactNoteModel = pgTable("contact_notes", {
  ...sharedColumns,
  text: text("text").notNull(),
  contactId: bigint("contact_id", { mode: "bigint" })
    .notNull()
    .references(() => contactModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  createdById: bigint("created_by_id", { mode: "bigint" }).references(
    () => userModel.id,
    {
      onDelete: "cascade",
      onUpdate: "cascade",
    },
  ),
})

export const customFieldModel = pgTable(
  "custom_fields",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    type: customFieldType("type").notNull(),
    description: text("description"),
    folderId: bigint("folder_id", { mode: "bigint" }).references(
      () => folderModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    showInInbox: boolean("show_in_inbox").notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("custom_fields_chatbot_id_field_type_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.type.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)

export const botFieldModel = pgTable(
  "bot_fields",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    type: customFieldType("type").notNull(),
    value: text("value"),
    description: text("description"),
    folderId: bigint("folder_id", { mode: "bigint" }).references(
      () => folderModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("bot_fields_chatbot_id_field_type_name_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
      table.type.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
)
