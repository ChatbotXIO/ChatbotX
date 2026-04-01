import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../partials/shared"
import { chatbotModel } from "./chatbot"
import { contactModel } from "./contact"
import { flowModel } from "./flow"
import { integrationWhatsappModel } from "./integrations/whatsapp"

export const broadcastStatus = pgEnum("broadcast_status", ["scheduled", "sent"])
export const broadcastSchedulesType = pgEnum("broadcast_schedules_type", [
  "now",
  "future",
])

export const broadcastModel = pgTable(
  "broadcasts",
  {
    ...sharedColumns,
    name: text("name").notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigint("flow_id", { mode: "bigint" }).references(
      () => flowModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    integrationWhatsappId: bigint("integration_whatsapp_id", {
      mode: "bigint",
    }).references(() => integrationWhatsappModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    templateId: bigint("template_id", { mode: "bigint" }),
    templateData: jsonb("template_data").notNull().default("{}"),
    status: broadcastStatus("status").notNull(),
    schedulesType: broadcastSchedulesType("schedules_type").notNull(),
    schedulesAt: timestamp("schedules_at", timestampConfig).notNull(),
    contactFilter: jsonb("contact_filter"),
    subaction: text("subaction").default("BSOO").notNull(),
    channel: text("channel").default("omnichannel").notNull(),
  },
  (table) => [
    index("broadcasts_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("broadcasts_flow_id_idx").using(
      "btree",
      table.flowId.asc().nullsLast(),
    ),
    index("broadcasts_channel_idx").using(
      "btree",
      table.channel.asc().nullsLast(),
    ),
    index("broadcasts_schedules_at_idx").using(
      "btree",
      table.schedulesAt.asc().nullsLast(),
    ),
  ],
)

export const contactsOnBroadcastsModel = pgTable(
  "contacts_on_broadcasts",
  {
    broadcastId: bigint("broadcast_id", { mode: "bigint" })
      .notNull()
      .references(() => broadcastModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigint("contact_id", { mode: "bigint" })
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sent: boolean("sent").default(false).notNull(),
    delivered: boolean("delivered").default(false).notNull(),
    seen: boolean("seen").default(false).notNull(),
    clicked: boolean("clicked").default(false).notNull(),
    failed: boolean("failed").default(false).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.broadcastId, table.contactId],
      name: "contacts_on_broadcasts_pkey",
    }),
  ],
)
