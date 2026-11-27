import z from "zod"

export const inventoryPolicyTypes = z.enum(["dont_track", "track"])
export type InventoryPolicyType = z.infer<typeof inventoryPolicyTypes>

/**
 * Whether a product is sold. Only `active` is shown and orderable; `draft`
 * and `unlisted` are hidden. A Shopify product mirrors Shopify's own status
 * (`ARCHIVED` lands as `draft`); our own products only use `active`/`draft`.
 */
export const productStatuses = z.enum(["active", "draft", "unlisted"])
export type ProductStatus = z.infer<typeof productStatuses>
