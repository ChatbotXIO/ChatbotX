import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { CredentialEncrypted } from "../partials/credential"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import {
  externalStoreConnectionStatus,
  externalStoreSyncStatus,
} from "./store-source"
import { workspaceModel } from "./workspace"

/**
 * The WooCommerce store a workspace's ecommerce mirrors, one per workspace.
 *
 * `encryptedAuth` holds a `WoocommerceAuthSecret` (the REST API keys and the
 * secret our webhooks are signed with) encrypted with
 * `woocommerce:{workspaceId}` as AAD; nothing ever reads it back out to a
 * client. `webhookIds` are the webhooks registered on connect, so disconnect
 * and workspace purge can remove exactly those.
 */
export const integrationWoocommerceModel = pgTable(
  "IntegrationWoocommerce",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** `https://example.com`, or with a path for WordPress in a sub-folder. */
    siteUrl: text().notNull(),
    storeName: text(),
    /** ISO 4217 code of the store, copied onto synced products and orders. */
    currency: text().notNull(),
    encryptedAuth: jsonb().$type<CredentialEncrypted>().notNull(),
    webhookIds: jsonb().$type<string[]>().notNull(),
    status: externalStoreConnectionStatus().default("active").notNull(),
    statusReason: text(),
    syncStatus: externalStoreSyncStatus().default("idle").notNull(),
    syncError: text(),
    lastSyncedAt: timestamp(timestampConfig),
    productCount: integer().default(0).notNull(),
    orderCount: integer().default(0).notNull(),
  },
  (table) => [
    uniqueIndex("IntegrationWoocommerce_workspaceId_key").on(table.workspaceId),
  ],
)
