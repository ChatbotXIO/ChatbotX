import type { EncryptedData } from "@chatbotx.io/encryption"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  type SocialAccountStatus,
  type SocialDestinationKind,
  type SocialProvider,
  socialAccountStatuses,
  socialDestinationKinds,
  socialProviders,
} from "../partials/social-account"
import { userModel } from "./auth-user"
import { workspaceModel } from "./workspace"

export const socialProvider = pgEnum(
  "socialProvider",
  socialProviders.options as [SocialProvider, ...SocialProvider[]],
)
export const socialAccountStatus = pgEnum(
  "socialAccountStatus",
  socialAccountStatuses.options as [
    SocialAccountStatus,
    ...SocialAccountStatus[],
  ],
)
export const socialDestinationKind = pgEnum(
  "socialDestinationKind",
  socialDestinationKinds.options as [
    SocialDestinationKind,
    ...SocialDestinationKind[],
  ],
)

/**
 * One TikTok login a workspace publishes through (its own Login Kit app,
 * separate from the inbox integration): connecting one creates no inbox,
 * integration or messaging webhook. The tokens are encrypted with an AAD that binds the
 * ciphertext to this row (`social-account:<workspaceId>:<id>`) and are never
 * part of any DTO, log or cache.
 */
export const socialAccountModel = pgTable(
  "SocialAccount",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    provider: socialProvider().notNull(),
    // The platform's id of the login (a Facebook user, an Instagram professional
    // account, a Threads user), unique per workspace and network.
    externalAccountId: text().notNull(),
    displayName: text().notNull(),
    username: text(),
    avatar: text(),
    // Null once the account is disconnected: the token is wiped, the row stays.
    accessToken: jsonb().$type<EncryptedData>(),
    refreshToken: jsonb().$type<EncryptedData>(),
    // Null when the token never expires.
    tokenExpiresAt: timestamp(timestampConfig),
    grantedScopes: text().array().notNull().default(sql`ARRAY[]::text[]`),
    status: socialAccountStatus().notNull().default("connected"),
    // Why the account needs a reconnect (an error category, or the permissions
    // the platform did not grant).
    statusReason: text(),
    lastVerifiedAt: timestamp(timestampConfig),
    connectedById: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    // A token refresh in flight holds the row until this time, so two workers
    // never refresh the same account.
    refreshLeaseExpiresAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("SocialAccount_workspaceId_provider_externalAccountId_key").on(
      table.workspaceId,
      table.provider,
      table.externalAccountId,
    ),
    index("SocialAccount_connectedById_idx")
      .on(table.connectedById)
      .where(sql`${table.connectedById} IS NOT NULL`),
    // The refresh scanner's due predicate.
    index("SocialAccount_tokenExpiresAt_idx")
      .on(table.tokenExpiresAt)
      .where(sql`${table.status} = 'connected'`),
    // Facebook Page, Instagram and Threads publish with their inbox's token (see
    // `PublishDestination`); only TikTok keeps a separate publishing login.
    check("SocialAccount_tiktok_check", sql`${table.provider} = 'tiktok'`),
  ],
)

/**
 * A place an account can publish to: a Facebook Page, or the one profile an
 * Instagram, Threads or TikTok login owns. Pages are merged by `externalId` on
 * every sync; one no longer listed stays as an inactive row so history keeps
 * its meaning.
 */
export const socialAccountDestinationModel = pgTable(
  "SocialAccountDestination",
  {
    ...sharedColumns,
    socialAccountId: bigintAsString()
      .notNull()
      .references(() => socialAccountModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    kind: socialDestinationKind().notNull(),
    externalId: text().notNull(),
    name: text().notNull(),
    username: text(),
    avatar: text(),
    // AAD `social-account-destination:<workspaceId>:<id>`. Null when the
    // account token publishes for this destination.
    accessToken: jsonb().$type<EncryptedData>(),
    isActive: boolean().notNull().default(true),
    lastSyncedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("SocialAccountDestination_socialAccountId_externalId_key").on(
      table.socialAccountId,
      table.externalId,
    ),
    index("SocialAccountDestination_workspaceId_idx").on(table.workspaceId),
  ],
)
