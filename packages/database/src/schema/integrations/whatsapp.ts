import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sharedColumns } from "../../partials/shared"
import { chatbotModel } from "../chatbot"
import { inboxModel } from "../inbox"

export const integrationWhatsappModel = pgTable(
  "integration_whatsapps",
  {
    ...sharedColumns,
    auth: jsonb("auth").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    wabaId: text("waba_id").notNull(),
    businessId: text("business_id").notNull(),
    name: text("name").notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    inboxId: bigint("inbox_id", { mode: "bigint" })
      .notNull()
      .references(() => inboxModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("integration_whatsapps_inbox_id_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
  ],
)

export const whatsappMessageTemplateModel = pgTable(
  "whatsapp_message_templates",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    integrationWhatsappId: bigint("integration_whatsapp_id", { mode: "bigint" })
      .notNull()
      .references(() => integrationWhatsappModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sourceId: text("source_id").notNull(),
    language: text("language").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    components: jsonb("components").notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    uniqueIndex(
      "whatsapp_message_templates_integration_whatsapp_id_source_id_key",
    ).using(
      "btree",
      table.integrationWhatsappId.asc().nullsLast(),
      table.sourceId.asc().nullsLast(),
    ),
  ],
)

export const whatsappFlowModel = pgTable("whatsapp_flows", {
  ...sharedColumns,
  name: text("name").notNull(),
  integrationWhatsappId: bigint("integration_whatsapp_id", { mode: "bigint" })
    .notNull()
    .references(() => integrationWhatsappModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  sourceId: text("source_id").notNull(),
  status: text("status").notNull(),
  isCompleted: boolean("is_completed").notNull(),
})
