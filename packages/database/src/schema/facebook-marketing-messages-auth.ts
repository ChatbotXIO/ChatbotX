import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { FacebookMarketingMessagesAuthStatus } from "../partials/facebook-marketing-messages"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { workspaceModel } from "./workspace"

/**
 * The workspace's Facebook Marketing Messages grant — one long-lived USER
 * token per workspace, granted through the Messenger app's Facebook Login for
 * Business config.
 *
 * Deliberately standalone (no `Integration` base row), mirroring
 * `MessagingAdsConnection` rather than `IntegrationFacebookAds`: this grant is
 * not a channel integration and never appears in the integrations list.
 *
 * `auth` holds an `encryptUtils.encryptObject`-wrapped `FacebookAdsAuthValue`.
 */
export const facebookMarketingMessagesAuthModel = pgTable(
  "FacebookMarketingMessagesAuth",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    auth: jsonb().notNull(),
    // Nullable: Facebook may return a token with no `expires_in`.
    tokenExpiresAt: timestamp(timestampConfig),
    status: text()
      .$type<FacebookMarketingMessagesAuthStatus>()
      .default("active")
      .notNull(),
    // Facebook App-Scoped User ID. Nullable — the identity lookup at connect
    // time is best-effort and must never fail the grant.
    facebookUserId: text(),
  },
  (table) => [
    uniqueIndex("FacebookMarketingMessagesAuth_workspaceId_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)
