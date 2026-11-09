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
 * How the REST API keys travel:
 * - `header` — HTTP Basic auth, the default;
 * - `query` — `consumer_key` / `consumer_secret` in the query string, for a
 *   host that strips the `Authorization` header (allowed over HTTPS only).
 */
export const woocommerceAuthModes = z.enum(["header", "query"])
export type WoocommerceAuthMode = z.infer<typeof woocommerceAuthModes>

/** The secrets kept encrypted on `IntegrationWoocommerce.encryptedAuth`. */
export const woocommerceAuthSecretSchema = z.object({
  consumerKey: z.string().min(1),
  consumerSecret: z.string().min(1),
  /** Generated on connect; WooCommerce signs our webhooks with it. */
  webhookSecret: z.string().min(1),
  authMode: woocommerceAuthModes,
})
export type WoocommerceAuthSecret = z.infer<typeof woocommerceAuthSecretSchema>

export const woocommerceConnectionStatuses = externalStoreConnectionStatuses
export type WoocommerceConnectionStatus = ExternalStoreConnectionStatus

export const woocommerceSyncStatuses = externalStoreSyncStatuses
export type WoocommerceSyncStatus = ExternalStoreSyncStatus

/** What a manual sync pulls again. */
export const woocommerceSyncScopes = externalStoreSyncScopes
export type WoocommerceSyncScope = ExternalStoreSyncScope

const TRAILING_SLASHES = /\/+$/
const NO_SCHEME = /^(?![a-z][a-z0-9+.-]*:\/\/)/i

/**
 * The store's site address: `https://` only (the keys travel with every
 * call), no query, fragment or trailing slash. A WordPress installed in a
 * sub-folder keeps its path, e.g. `https://example.com/shop`.
 */
export const woocommerceSiteUrlSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(NO_SCHEME, "https://"))
  .pipe(
    z.url({
      protocol: /^https$/,
      error: "Enter the store's https:// address, e.g. https://example.com.",
    }),
  )
  .transform((value) => {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`.replace(TRAILING_SLASHES, "")
  })

/**
 * The webhook topics registered on connect. Each is delivered to
 * `/api/woocommerce/{workspaceId}/webhook`.
 */
export const WOOCOMMERCE_WEBHOOK_TOPICS = [
  "product.created",
  "product.updated",
  "product.deleted",
  "product.restored",
  "order.created",
  "order.updated",
  "order.deleted",
  "order.restored",
  "coupon.created",
  "coupon.updated",
  "coupon.deleted",
  "coupon.restored",
] as const
export type WoocommerceWebhookTopic =
  (typeof WOOCOMMERCE_WEBHOOK_TOPICS)[number]
