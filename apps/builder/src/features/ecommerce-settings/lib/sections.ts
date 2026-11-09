import { z } from "zod"

export const ecommerceSettingsSections = z.enum([
  "general",
  "payments",
  "shipping",
  "checkout",
  "shopify",
  "woocommerce",
])
export type EcommerceSettingsSection = z.infer<typeof ecommerceSettingsSections>

/**
 * The groups a connected external store (Shopify, WooCommerce) replaces: it
 * owns payment and delivery.
 */
export const externalStoreHiddenSections: readonly EcommerceSettingsSection[] =
  ["payments", "shipping"]
