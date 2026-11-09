import {
  integer,
  jsonb,
  pgEnum,
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
import { type ShopifyAuthKind, shopifyAuthKinds } from "../partials/shopify"
import {
  externalStoreConnectionStatus,
  externalStoreSyncStatus,
} from "./store-source"
import { workspaceModel } from "./workspace"

export const shopifyAuthKind = pgEnum(
  "shopifyAuthKind",
  shopifyAuthKinds.options as [ShopifyAuthKind, ...ShopifyAuthKind[]],
)

/**
 * The Shopify store a workspace's ecommerce mirrors, one per workspace.
 *
 * `encryptedAuth` holds a `ShopifyAuthSecret` encrypted with
 * `shopify:{workspaceId}` as AAD; nothing ever reads it back out to a client.
 * `webhookSubscriptionIds` are the subscriptions registered on connect, so
 * disconnect and workspace purge can remove exactly those.
 */
export const integrationShopifyModel = pgTable(
  "IntegrationShopify",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** `your-store.myshopify.com`. */
    shopDomain: text().notNull(),
    shopName: text(),
    /** ISO 4217 code of the store, copied onto synced products and orders. */
    currency: text().notNull(),
    authKind: shopifyAuthKind().notNull(),
    encryptedAuth: jsonb().$type<CredentialEncrypted>().notNull(),
    webhookSubscriptionIds: jsonb().$type<string[]>().notNull(),
    status: externalStoreConnectionStatus().default("active").notNull(),
    statusReason: text(),
    syncStatus: externalStoreSyncStatus().default("idle").notNull(),
    syncError: text(),
    lastSyncedAt: timestamp(timestampConfig),
    productCount: integer().default(0).notNull(),
    orderCount: integer().default(0).notNull(),
  },
  (table) => [
    uniqueIndex("IntegrationShopify_workspaceId_key").on(table.workspaceId),
  ],
)
