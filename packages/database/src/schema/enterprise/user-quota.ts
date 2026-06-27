import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../../partials/shared"
import { userModel } from "../auth-user"

export const userQuotaModel = pgTable("UserQuota", {
  ...sharedColumns,
  userId: bigintAsString()
    .notNull()
    .unique()
    .references(() => userModel.id, { onDelete: "cascade" }),
  contactsLimit: integer(),
  contactsUsed: integer().notNull().default(0),
  workspacesLimit: integer(),
  workspacesUsed: integer().notNull().default(0),
  channelsLimit: integer(),
  channelsUsed: integer().notNull().default(0),
  teamMembersLimit: integer(),
  teamMembersUsed: integer().notNull().default(0),
  macLimit: integer(),
  macUsed: integer().notNull().default(0),
  whiteLabel: boolean().notNull().default(false),
  ssoSaml: boolean().notNull().default(false),
  saasMode: boolean().notNull().default(false),
  // Plan identity. Cloud sign-up stamps an initial OSS trial row; the enterprise
  // billing layer (publishEntitlements) remains authoritative and overwrites it.
  // null = free tier / not yet synced.
  planName: text(),
  planStatus: text(),
  // Enterprise-owned trial selection. null means fall back to the scoped
  // effective default plan; OSS quota enforcement ignores this column.
  selectedTrialPlanId: bigintAsString(),
  periodStart: timestamp(timestampConfig),
  periodEnd: timestamp(timestampConfig),
  syncedAt: timestamp(timestampConfig).notNull().defaultNow(),
})
