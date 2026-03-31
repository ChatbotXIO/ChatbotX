import { sql } from "drizzle-orm"
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { z } from "zod"
import { UploadMode } from "../../../types"
import { chatbotModel } from "../chatbot"
import { flowModel } from "../flow"
import { inboxModel } from "../inbox"
import { sharedColumns } from "../shared"

export const messengerGreetingMessage = z.object({
  locale: z.string(),
  text: z.string(),
})
export type MessengerGreetingMessage = z.infer<typeof messengerGreetingMessage>

export const persistentMenuType = z.enum(["flow", "url"])

export const messengerPersistentMenu = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(persistentMenuType.enum.flow),
    flowId: z.bigint(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(persistentMenuType.enum.url),
    url: z.url(),
  }),
])
export type MessengerPersistentMenu = z.infer<typeof messengerPersistentMenu>

export const messengerPersona = z.object({
  isDefault: z.boolean(),
  name: z.string(),
  profilePicture: z.object({
    id: z.bigint(),
    url: z.url(),
    mode: z.enum(UploadMode),
  }),
  facebookPersonaId: z.string().optional(),
})
export type MessengerPersona = z.infer<typeof messengerPersona>

export const messengerConversationStarter = z.object({
  question: z.string(),
  flowId: z.string(),
})
export type MessengerConversationStarter = z.infer<
  typeof messengerConversationStarter
>

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
