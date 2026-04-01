import {
  bigint,
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { ChatbotMemberPermissions } from "../partials/chatbot"
import { sharedColumns, timestampConfig } from "../partials/shared"
import { chatbotModel } from "./chatbot"
import { organizationModel } from "./organization"

export const accountModel = pgTable("accounts", {
  ...sharedColumns,
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", timestampConfig),
  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", timestampConfig),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  userId: bigint("user_id", { mode: "bigint" })
    .notNull()
    .references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
})

export const invitationModel = pgTable(
  "invitations",
  {
    ...sharedColumns,
    code: text("code").notNull(),
    permissions: jsonb("permissions")
      .$type<ChatbotMemberPermissions>()
      .notNull(),
    expiresAt: timestamp("expires_at", timestampConfig).notNull(),
    organizationId: bigint("organization_id", { mode: "bigint" })
      .notNull()
      .references(() => organizationModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    chatbotId: bigint("chatbot_id", { mode: "bigint" }).references(
      () => chatbotModel.id,
      {
        onDelete: "cascade",
        onUpdate: "cascade",
      },
    ),
    invitedBy: bigint("invited_by", { mode: "bigint" })
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("invitations_code_key").using(
      "btree",
      table.code.asc().nullsLast(),
    ),
  ],
)

export const sessionModel = pgTable(
  "sessions",
  {
    ...sharedColumns,
    expiresAt: timestamp("expires_at", timestampConfig).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("sessions_token_key").using(
      "btree",
      table.token.asc().nullsLast(),
    ),
  ],
)

export const userModel = pgTable(
  "users",
  {
    ...sharedColumns,
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    isAnonymous: boolean("is_anonymous").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("users_email_key").using(
      "btree",
      table.email.asc().nullsLast(),
    ),
  ],
)

export const verificationModel = pgTable("verifications", {
  ...sharedColumns,
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", timestampConfig).notNull(),
})

export const jwkModel = pgTable("jwks", {
  ...sharedColumns,
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  expiresAt: timestamp("expires_at", timestampConfig),
})
