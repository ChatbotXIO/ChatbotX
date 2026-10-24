import { z } from "zod"

export const ecommerceSettingsSections = z.enum([
  "general",
  "payments",
  "shipping",
  "checkout",
])
export type EcommerceSettingsSection = z.infer<typeof ecommerceSettingsSections>
