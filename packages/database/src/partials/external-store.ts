import { z } from "zod"

/**
 * A connection to an external store (Shopify, WooCommerce) is `active` until
 * the store refuses the credentials or the app or key is removed.
 */
export const externalStoreConnectionStatuses = z.enum(["active", "invalid"])
export type ExternalStoreConnectionStatus = z.infer<
  typeof externalStoreConnectionStatuses
>

export const externalStoreSyncStatuses = z.enum([
  "idle",
  "queued",
  "running",
  "succeeded",
  "failed",
])
export type ExternalStoreSyncStatus = z.infer<typeof externalStoreSyncStatuses>

/** What a manual sync of an external store pulls again. */
export const externalStoreSyncScopes = z.enum(["all", "products", "orders"])
export type ExternalStoreSyncScope = z.infer<typeof externalStoreSyncScopes>
