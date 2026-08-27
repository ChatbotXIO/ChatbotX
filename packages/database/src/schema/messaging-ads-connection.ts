import { sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { MessagingAdsConnectionStatus } from "../partials/messaging-ads-connection"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { integrationInstagramModel } from "./integration-instagram"
import { integrationMessengerModel } from "./integration-messenger"
import { integrationWhatsappModel } from "./integration-whatsapp"
import { messagingAdChannel } from "./messaging-ad-operation"
import { workspaceModel } from "./workspace"

/**
 * Per-integration Facebook Ads OAuth connection backing the messaging-ads
 * manager boxes (CTWA/CTM/CTID) — out/plan/ctwa-ctm-ctid-box-merge.md
 * "Auth = per-integration". Deliberately SEPARATE from
 * `IntegrationFacebookAds` (the workspace-wide connection the Ads dashboard
 * and CAPI still use): each concrete channel integration row (one WhatsApp
 * number / one Messenger Page / one Instagram account) connects its OWN
 * Graph token here via the per-box Connect button, rather than sharing one
 * workspace-wide grant.
 *
 * Mirrors `integrationFacebookAdsModel`'s auth/status shape (encrypted
 * `auth` jsonb + `active`/`invalid` `status`) but keyed per integration
 * instead of per workspace, and deliberately has NO `adAccounts` column —
 * the ad account is still chosen per campaign in the wizard, exactly like
 * `IntegrationFacebookAds`.
 */
export const messagingAdsConnectionModel = pgTable(
  "MessagingAdsConnection",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    channel: messagingAdChannel().notNull(),
    // Exactly one of these three is set, matching `channel` — enforced by
    // the check constraint below, mirroring `MessagingAdOperation`'s pattern
    // (schema/messaging-ad-operation.ts). The app layer still re-checks
    // workspaceId + integrationId together on every read (there is no
    // DB-level composite FK proving the integration belongs to the
    // workspace) — see `messagingAdsConnectionRepository.findForIntegration`.
    integrationWhatsappId: bigintAsString().references(
      () => integrationWhatsappModel.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    integrationMessengerId: bigintAsString().references(
      () => integrationMessengerModel.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    integrationInstagramId: bigintAsString().references(
      () => integrationInstagramModel.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    auth: jsonb().notNull(),
    status: text()
      .$type<MessagingAdsConnectionStatus>()
      .default("active")
      .notNull(),
  },
  (table) => [
    index("MessagingAdsConnection_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    // A plain unique index on a nullable column allows unlimited NULL rows
    // (Postgres never treats two NULLs as equal) while still enforcing "at
    // most one connection per integration" for the rows that DO reference
    // that column — matching `IntegrationFacebookAds_integrationId_key`.
    uniqueIndex("MessagingAdsConnection_integrationWhatsappId_key").using(
      "btree",
      table.integrationWhatsappId.asc().nullsLast(),
    ),
    uniqueIndex("MessagingAdsConnection_integrationMessengerId_key").using(
      "btree",
      table.integrationMessengerId.asc().nullsLast(),
    ),
    uniqueIndex("MessagingAdsConnection_integrationInstagramId_key").using(
      "btree",
      table.integrationInstagramId.asc().nullsLast(),
    ),
    check(
      "MessagingAdsConnection_channel_integration_check",
      // Exactly one channel FK is set and the other two are NULL — a
      // malformed write can never associate a connection with more than one
      // channel. Mirrors `MessagingAdOperation_channel_integration_check`.
      sql`(${table.channel} = 'whatsapp' AND ${table.integrationWhatsappId} IS NOT NULL AND ${table.integrationMessengerId} IS NULL AND ${table.integrationInstagramId} IS NULL) OR (${table.channel} = 'messenger' AND ${table.integrationMessengerId} IS NOT NULL AND ${table.integrationWhatsappId} IS NULL AND ${table.integrationInstagramId} IS NULL) OR (${table.channel} = 'instagram' AND ${table.integrationInstagramId} IS NOT NULL AND ${table.integrationWhatsappId} IS NULL AND ${table.integrationMessengerId} IS NULL)`,
    ),
  ],
)
