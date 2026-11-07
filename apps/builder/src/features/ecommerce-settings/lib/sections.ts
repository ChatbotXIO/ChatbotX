import { z } from "zod"

export const ecommerceSettingsSections = z.enum([
  "general",
  "payments",
  "shipping",
  "checkout",
  "shopify",
])
export type EcommerceSettingsSection = z.infer<typeof ecommerceSettingsSections>

/** The groups a connected Shopify store replaces: it owns payment and delivery. */
export const shopifyHiddenSections: readonly EcommerceSettingsSection[] = [
  "payments",
  "shipping",
]
