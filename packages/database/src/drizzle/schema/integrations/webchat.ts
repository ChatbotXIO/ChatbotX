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
import { z } from "zod"
import { chatbotModel } from "../chatbot"
import { flowModel } from "../flow"
import { inboxModel } from "../inbox"
import { sharedColumns } from "../shared"

export const webchatConversationStarterType = z.enum(["flow", "message", "url"])
export type WebchatConversationStarterType = z.infer<
  typeof webchatConversationStarterType
>
export const webchatPersistentMenuType = z.enum(["flow", "url"])
export type WebchatPersistentMenuType = z.infer<
  typeof webchatPersistentMenuType
>

export const webchatConversationStarter = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatConversationStarterType.enum.flow),
    flowId: z.bigint(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatConversationStarterType.enum.message),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatConversationStarterType.enum.url),
    url: z.url(),
  }),
])
export type WebchatConversationStarter = z.infer<
  typeof webchatConversationStarter
>

export const webchatPersistentMenu = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatPersistentMenuType.enum.flow),
    flowId: z.bigint(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal(webchatPersistentMenuType.enum.url),
    url: z.url(),
  }),
])
export type WebchatPersistentMenu = z.infer<typeof webchatPersistentMenu>

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
