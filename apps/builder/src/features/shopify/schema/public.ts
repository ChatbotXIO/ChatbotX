import {
  SHOPIFY_REQUIRED_SCOPES,
  shopifyAuthKinds,
  shopifyConnectionStatuses,
  shopifySyncScopes,
  shopifySyncStatuses,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

const secret = (description: string) =>
  z.string().trim().min(1).max(512).describe(description)

const shopDomain = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .describe(
    "The store's `.myshopify.com` domain, e.g. `your-store.myshopify.com` (Shopify admin → Settings → Domains).",
  )

export const connectShopifyRequest = z.discriminatedUnion("authKind", [
  z.object({
    authKind: z
      .literal("token")
      .describe("A custom app made in the store's admin before 2026."),
    shopDomain,
    accessToken: secret(
      "The app's Admin API access token (`shpat_…`). Stored encrypted, never returned.",
    ),
    apiSecret: secret(
      "The app's API secret key, which signs the store's webhooks. Stored encrypted, never returned.",
    ),
  }),
  z.object({
    authKind: z
      .literal("clientCredentials")
      .describe(
        "An app made in Shopify's Dev Dashboard and installed on the store.",
      ),
    shopDomain,
    clientId: secret("The app's Client ID."),
    clientSecret: secret(
      "The app's Client Secret. Stored encrypted, never returned.",
    ),
  }),
])
export type ConnectShopifyRequest = z.infer<typeof connectShopifyRequest>

export const syncShopifyRequest = z.object({
  scope: shopifySyncScopes
    .default("all")
    .describe(
      "`all` (products, discount codes and the last 60 days of orders), `products` (products and discount codes) or `orders`.",
    ),
})

const connectedResource = z.object({
  connected: z.literal(true),
  shopDomain: z.string(),
  shopName: z.string().nullable(),
  currency: z.string().describe("The store's ISO 4217 currency."),
  authKind: shopifyAuthKinds,
  status: shopifyConnectionStatuses.describe(
    "`invalid` once Shopify refused the credentials or the app was uninstalled; connect again.",
  ),
  statusReason: z.string().nullable(),
  syncStatus: shopifySyncStatuses.describe(
    "The last sync's state; poll `shopify.getStatus` until `succeeded` or `failed`.",
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
      "Where Shopify delivers the store's changes; registered automatically on connect.",
    ),
  adminUrl: z.string().describe("The store's Shopify admin."),
  connectedAt: z.date(),
})

export const shopifyStatusResource = z.discriminatedUnion("connected", [
  connectedResource,
  z.object({
    connected: z.literal(false),
    webhookUrl: z
      .string()
      .describe(
        "Where Shopify will deliver the store's changes once connected.",
      ),
  }),
])

export const shopifyConnectionResource = connectedResource

export const SHOPIFY_SCOPES_TEXT = SHOPIFY_REQUIRED_SCOPES.join(", ")
