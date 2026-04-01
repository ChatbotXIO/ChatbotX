import { sql } from "drizzle-orm"
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  MessengerConversationStarter,
  MessengerGreetingMessage,
  MessengerPersistentMenu,
  MessengerPersona,
} from "../../partials/integration-messenger"
import { sharedColumns } from "../../partials/shared"
import { chatbotModel } from "../chatbot"
import { flowModel } from "../flow"
import { inboxModel } from "../inbox"

export const integrationMessengerModel = pgTable(
  "integration_messengers",
  {
    ...sharedColumns,
    auth: jsonb("auth").notNull(),
    pageId: text("page_id").notNull(),
    name: text("name").notNull(),
    conversationStarters: jsonb("conversation_starters")
      .$type<MessengerConversationStarter[]>()
      .default(sql`[]`)
      .notNull(),
    persistentMenus: jsonb("persistent_menus")
      .$type<MessengerPersistentMenu[]>()
      .default(sql`[]`)
      .notNull(),
    greetingMessages: jsonb("greeting_messages")
      .$type<MessengerGreetingMessage[]>()
      .default(sql`[]`)
      .notNull(),
    personas: jsonb("personas")
      .$type<MessengerPersona[]>()
      .default(sql`[]`)
      .notNull(),
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
    index("integration_messengers_chatbot_id_idx").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
    index("integration_messengers_welcome_flow_id_idx").using(
      "btree",
      table.welcomeFlowId.asc().nullsLast(),
    ),
    uniqueIndex("integration_messengers_inbox_id_key").using(
      "btree",
      table.inboxId.asc().nullsLast(),
    ),
    uniqueIndex("integration_messengers_page_id_key").using(
      "btree",
      table.pageId.asc().nullsLast(),
    ),
  ],
)
