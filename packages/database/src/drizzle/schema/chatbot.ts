import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { z } from "zod"
import { userModel } from "./auth"
import { organizationModel } from "./organization"
import { sharedColumns } from "./shared"

export const chatbotMemberPermissionsSchema = z.object({
  superAdmin: z.boolean(),
  analytics: z.boolean(),
  flows: z.boolean(),
  contacts: z.boolean(),
  onlyAssignedContacts: z.boolean(),
  emailAndPhone: z.boolean(),
  broadcast: z.boolean(),
  ecommerce: z.boolean(),
})
export type ChatbotMemberPermissions = z.infer<
  typeof chatbotMemberPermissionsSchema
>

export const chatbotMemberNotificationTypesSchema = z.object({
  notifyAdmin: z.boolean(),
  newMessageToHuman: z.boolean(),
  newOrder: z.boolean(),
})
export type ChatbotMemberNotificationTypes = z.infer<
  typeof chatbotMemberNotificationTypesSchema
>

export const chatbotMemberNotificationChannelsSchema = z.object({
  messenger: z.boolean(),
  email: z.boolean(),
  telegram: z.boolean(),
  browser: z.boolean(),
})
export type ChatbotMemberNotificationChannels = z.infer<
  typeof chatbotMemberNotificationChannelsSchema
>

export const chatbotMemberRoles = pgEnum("chatbot_member_roles", [
  "owner",
  "agent",
])

export const chatbotModel = pgTable("chatbots", {
  ...sharedColumns,
  name: text("name").notNull(),
  defaultReply: text("default_reply"),
  targetCountry: text("target_country"),
  defaultLanguage: text("default_language").default("en").notNull(),
  accountTimezone: text("account_timezone").notNull(),
  brandColor: text("brand_color").default("#016DFF").notNull(),
  developmentMode: boolean("development_mode").default(false).notNull(),
  logo: text("logo"),
  organizationId: bigint("organization_id", { mode: "bigint" })
    .notNull()
    .references(() => organizationModel.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  plan: text("plan").default("free").notNull(),
  token: text("token"),
})

export const chatbotMemberModel = pgTable("chatbot_members", {
  ...sharedColumns,
  chatbotId: bigint("chatbot_id", { mode: "bigint" })
    .notNull()
    .references(() => chatbotModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  userId: bigint("user_id", { mode: "bigint" })
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  role: chatbotMemberRoles("role").notNull(),
  notificationChannels: jsonb("notification_channels")
    .$type<ChatbotMemberNotificationChannels>()
    .default(sql`'{}'`)
    .notNull(),
  notificationTypes: jsonb("notification_types")
    .$type<ChatbotMemberNotificationTypes>()
    .default(sql`'{}'`)
    .notNull(),
  permissions: jsonb("permissions")
    .$type<ChatbotMemberPermissions>()
    .default(sql`'{}'`)
    .notNull(),
})

export const chatbotUsageModel = pgTable(
  "chatbot_usages",
  {
    ...sharedColumns,
    contactsCount: integer("contacts_count").default(0).notNull(),
    maxContacts: integer("max_contacts").default(0).notNull(),
    chatbotId: bigint("chatbot_id", { mode: "bigint" })
      .notNull()
      .references(() => chatbotModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("ChatbotUsage_chatbotId_key").using(
      "btree",
      table.chatbotId.asc().nullsLast(),
    ),
  ],
)
