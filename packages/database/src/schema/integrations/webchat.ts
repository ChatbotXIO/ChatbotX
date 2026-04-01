import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  WebchatConversationStarter,
  WebchatPersistentMenu,
} from "../../partials/integration-webchat"
import { sharedColumns } from "../../partials/shared"
import { chatbotModel } from "../chatbot"
import { flowModel } from "../flow"
import { inboxModel } from "../inbox"

export const integrationWebchatModel = pgTable(
  "integration_webchats",
  {
    ...sharedColumns,
    auth: jsonb("auth").notNull(),
    name: text("name").notNull(),
    enable: boolean("enable").default(true).notNull(),
    authorizedDomains: text("authorized_domains")
      .array()
      .notNull()
      .default(sql`[]`),
    conversationStarters: jsonb("conversation_starters")
      .$type<WebchatConversationStarter>()
      .array()
      .notNull()
      .default(sql`[]`),
    persistentMenus: jsonb("persistent_menus")
      .$type<WebchatPersistentMenu>()
      .array()
      .notNull()
      .default(sql`[]`),
    brandColor: text("brand_color").default("#007bff").notNull(),
    hideHeader: boolean("hide_header").default(false).notNull(),
    showLogo: boolean("show_logo").default(false).notNull(),
    hideMessageInput: boolean("hide_message_input").default(false).notNull(),
    customCss: text("custom_css"),
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
    welcomeFlowId: bigint("welcome_flow_id", { mode: "bigint" }).references(
      () => flowModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
  },
  (table) => [
    index("integration_webchats_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("integration_webchats_inbox_id_idx").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("integration_webchats_inbox_id_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    index("integration_webchats_welcome_flow_id_idx").using(
      "btree",
      table.welcomeFlowId.asc().nullsLast(),
    ),
  ],
)
