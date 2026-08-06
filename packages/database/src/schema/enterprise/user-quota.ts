import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../../partials/shared"
import { userModel } from "../auth-user"

export const userQuotaModel = pgTable(
  "UserQuota",
  {
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
    botMessagesLimit: integer(),
    botMessagesUsed: integer().notNull().default(0),
    monthlyBotMessagesLimit: integer(),
    monthlyBotMessagesUsed: integer().notNull().default(0),
    // Which billing period `monthlyBotMessagesUsed` belongs to. A real DB column
    // rather than a Redis live-hash stamp (contrast `macPeriodStart`): MAC's
    // Redis-only stamp is safe because `reconcileMac` re-grounds from the durable,
    // period-scoped `ContactActiveMonthly` ledger on every sync, so a lost stamp
    // self-heals. Bot messages have no ledger and no reconcile backstop at all, so
    // losing this stamp (e.g. a Redis flush) must not silently mis-fire or skip a
    // reset — durable storage is required. null = never reset yet (first run).
    monthlyBotMessagesPeriodStart: timestamp(timestampConfig),
    // Enterprise-owned lifetime bot-message credit total, mirrored from the
    // platform-db `TopUpGrant` ledger by `publishEntitlements`. Exists ONLY so the
    // credit survives every one of `publishEntitlements`' from-scratch recomputes
    // of `botMessagesLimit` (18 call sites) — enforcement never reads this column
    // directly, it only reads the already-inflated `botMessagesLimit`. Purely
    // auditable/display state, not a second source of truth.
    botMessagesTopUpGranted: integer().notNull().default(0),
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
    channelsTornDownAt: timestamp(timestampConfig),
    syncedAt: timestamp(timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    index("UserQuota_channelsTornDownAt_idx").on(table.channelsTornDownAt),
    index("UserQuota_due_expired_trial_idx")
      .on(table.userId)
      .where(sql`"channelsTornDownAt" IS NULL AND "planStatus" = 'trial'`),
  ],
)
