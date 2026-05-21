import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type {
  CredentialEncrypted,
  CredentialPublicByType,
  CredentialType,
} from "../partials/credential"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { userModel } from "./auth-user"

export const platformCredentialModel = pgTable(
  "PlatformCredential",
  {
    ...sharedColumns,
    // userId IS NOT NULL → user/reseller-owned credential
    // userId IS NULL     → platform/system credential
    userId: bigintAsString().references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    type: text().$type<CredentialType>().notNull(),
    publicConfig: jsonb()
      .$type<CredentialPublicByType[CredentialType]>()
      .notNull(),
    value: jsonb().$type<CredentialEncrypted>().notNull(),
    // For payment providers (stripe, paddle): distinguishes live vs test keys.
    // Non-payment providers always use false.
    livemode: boolean().notNull().default(false),
    // When true this row is a delegation pointer — use platform credential instead.
    usePlatformCredential: boolean().notNull().default(false),
    // Verification tracking — primarily for payment provider credentials.
    isVerified: boolean().notNull().default(false),
    verifiedAt: timestamp(timestampConfig),
    lastUsedAt: timestamp(timestampConfig),
  },
  (table) => [
    // User-scoped: one credential per (user, type, livemode)
    uniqueIndex("PlatformCredential_user_type_livemode_key")
      .on(table.userId, table.type, table.livemode)
      .where(sql`${table.userId} IS NOT NULL`),
    // Platform-scoped: one platform credential per (type, livemode)
    uniqueIndex("PlatformCredential_platform_type_livemode_key")
      .on(table.type, table.livemode)
      .where(sql`${table.userId} IS NULL`),
    index("PlatformCredential_userId_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
  ],
)
