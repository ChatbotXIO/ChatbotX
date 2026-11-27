import { z } from "zod"
import {
  type ExternalStoreConnectionStatus,
  type ExternalStoreSyncScope,
  type ExternalStoreSyncStatus,
  externalStoreConnectionStatuses,
  externalStoreSyncScopes,
  externalStoreSyncStatuses,
} from "./external-store"

/**
 * How the store's Shopify app authenticates:
 * - `token` — a legacy custom app's Admin API access token (`shpat_…`) plus
 *   its API secret key, which signs the webhooks;
 * - `clientCredentials` — a Dev Dashboard app's Client ID and Client Secret;
 *   a 24-hour access token is requested from them and renewed when it expires.
 */
export const shopifyAuthKinds = z.enum(["token", "clientCredentials"])
export type ShopifyAuthKind = z.infer<typeof shopifyAuthKinds>

/** The secrets kept encrypted on `IntegrationShopify.encryptedAuth`. */
export const shopifyAuthSecretSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("token"),
    accessToken: z.string().min(1),
    apiSecret: z.string().min(1),
  }),
  z.object({
    kind: z.literal("clientCredentials"),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    accessToken: z.string().nullable(),
    /** ISO time the cached access token stops working. */
    accessTokenExpiresAt: z.string().nullable(),
  }),
])
export type ShopifyAuthSecret = z.infer<typeof shopifyAuthSecretSchema>

/** `active` until Shopify refuses the credentials or the app is uninstalled. */
export const shopifyConnectionStatuses = externalStoreConnectionStatuses
export type ShopifyConnectionStatus = ExternalStoreConnectionStatus

export const shopifySyncStatuses = externalStoreSyncStatuses
export type ShopifySyncStatus = ExternalStoreSyncStatus

/** What a manual sync pulls again. */
export const shopifySyncScopes = externalStoreSyncScopes
export type ShopifySyncScope = ExternalStoreSyncScope

const URL_SCHEME = /^https?:\/\//
const URL_PATH = /\/.*$/

/** A store's `.myshopify.com` domain, lower-cased, without scheme or path. */
export const shopifyShopDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(URL_SCHEME, "").replace(URL_PATH, ""))
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/,
        "Enter the store's .myshopify.com domain, e.g. your-store.myshopify.com.",
      ),
  )

/**
 * The webhook topics registered on connect, in Shopify's GraphQL enum
 * spelling. Each is delivered to `/api/shopify/{workspaceId}/webhook`.
 */
export const SHOPIFY_WEBHOOK_TOPICS = [
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "INVENTORY_LEVELS_UPDATE",
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_PAID",
  "ORDERS_FULFILLED",
  "ORDERS_CANCELLED",
  "FULFILLMENTS_UPDATE",
  "DISCOUNTS_CREATE",
  "DISCOUNTS_UPDATE",
  "DISCOUNTS_DELETE",
  "APP_UNINSTALLED",
] as const
export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number]

/** The access scopes the Shopify app must grant. */
export const SHOPIFY_REQUIRED_SCOPES = [
  "read_products",
  "read_inventory",
  "read_orders",
  "write_orders",
  "read_customers",
  "read_discounts",
  "read_fulfillments",
] as const
