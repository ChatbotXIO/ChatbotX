import {
  woocommerceConnectionStatuses,
  woocommerceSyncScopes,
  woocommerceSyncStatuses,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

const secret = (description: string) =>
  z.string().trim().min(1).max(512).describe(description)

export const connectWooCommerceRequest = z.object({
  siteUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .describe(
      "The store's address, `https://` only, e.g. `https://example.com` (or `https://example.com/shop` for WordPress in a sub-folder).",
    ),
  consumerKey: secret(
    "The REST API key's Consumer key (`ck_…`), made in WooCommerce → Settings → Advanced → REST API with Read/Write permission. Stored encrypted, never returned.",
  ),
  consumerSecret: secret(
    "The REST API key's Consumer secret (`cs_…`). Stored encrypted, never returned.",
  ),
})
export type ConnectWooCommerceRequest = z.infer<
  typeof connectWooCommerceRequest
>

export const syncWooCommerceRequest = z.object({
  scope: woocommerceSyncScopes
    .default("all")
    .describe(
      "`all` (products, coupons and the last 60 days of orders), `products` (products and coupons) or `orders`.",
    ),
})

const connectedResource = z.object({
  connected: z.literal(true),
  siteUrl: z.string(),
  storeName: z.string().nullable(),
  currency: z.string().describe("The store's ISO 4217 currency."),
  consumerKeyHint: z
    .string()
    .describe("The start of the Consumer key, to tell keys apart."),
  status: woocommerceConnectionStatuses.describe(
    "`invalid` once the store refused the REST API keys; connect again.",
  ),
  statusReason: z.string().nullable(),
  syncStatus: woocommerceSyncStatuses.describe(
    "The last sync's state; poll `woocommerce.getStatus` until `succeeded` or `failed`.",
  ),
  syncError: z.string().nullable(),
  lastSyncedAt: z.date().nullable(),
  productCount: z.number().int(),
  orderCount: z
    .number()
    .int()
    .describe("Orders mirrored by the last order sync."),
  webhookUrl: z
    .string()
    .describe(
      "Where WooCommerce delivers the store's changes; registered automatically on connect.",
    ),
  adminUrl: z.string().describe("The store's WordPress admin."),
  connectedAt: z.date(),
})

export const wooCommerceStatusResource = z.discriminatedUnion("connected", [
  connectedResource,
  z.object({
    connected: z.literal(false),
    webhookUrl: z
      .string()
      .describe(
        "Where WooCommerce will deliver the store's changes once connected.",
      ),
  }),
])

export const wooCommerceConnectionResource = connectedResource
