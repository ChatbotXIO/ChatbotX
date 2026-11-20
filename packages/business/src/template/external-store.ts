import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { ecommerceSettingsRepository } from "@chatbotx.io/database/repositories"

/**
 * The Ecommerce group: everything a connected Shopify or WooCommerce store
 * mirrors (catalog, categories, vendors, discount codes) or runs on (opening
 * hours and settings are the store's own configuration). When either workspace
 * sells from an external store the whole group stays out of the template and is
 * skipped on install: one rule, applied at every seam (see the callers).
 */
export const EXTERNAL_STORE_CATEGORIES: ReadonlySet<TemplateCategory> = new Set(
  [
    "products",
    "productCategories",
    "openHours",
    "vendors",
    "discountCodes",
    "storeSettings",
  ],
)

export const isExternalStoreCategory = (category: TemplateCategory): boolean =>
  EXTERNAL_STORE_CATEGORIES.has(category)

/**
 * True when the workspace sells from a connected external store. Read from the
 * row (through `tx` inside an install), not from the Redis-cached
 * `resolveStoreSource`, so an install decides on what it can see.
 */
export const workspaceUsesExternalStore = async (
  workspaceId: string,
  tx?: DatabaseClient,
): Promise<boolean> => {
  const settings = await ecommerceSettingsRepository.find(workspaceId, tx)
  return settings !== undefined && settings.storeSource !== "chatbotx"
}
