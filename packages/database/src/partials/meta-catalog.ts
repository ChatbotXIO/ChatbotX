import { z } from "zod"

export const metaCatalogAuthModes = z.enum(["oauth", "fbe"])
export type MetaCatalogAuthMode = z.infer<typeof metaCatalogAuthModes>

export const metaCatalogConnectionStatuses = z.enum(["active", "invalid"])
export type MetaCatalogConnectionStatus = z.infer<
  typeof metaCatalogConnectionStatuses
>

export const metaCatalogImportStatuses = z.enum([
  "idle",
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
])
export type MetaCatalogImportStatus = z.infer<typeof metaCatalogImportStatuses>

export const metaCatalogSyncStatuses = z.enum([
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
])
export type MetaCatalogSyncStatus = z.infer<typeof metaCatalogSyncStatuses>

export const metaCatalogSyncScopes = z.enum(["all", "category", "selected"])
export type MetaCatalogSyncScope = z.infer<typeof metaCatalogSyncScopes>

/** How a product came to be linked: pushed up to Meta, or pulled down from it. */
export const metaCatalogItemDirections = z.enum(["push", "import"])
export type MetaCatalogItemDirection = z.infer<typeof metaCatalogItemDirections>

export const metaCatalogSkipReasons = z.enum([
  "missingImage",
  "missingDescription",
  "missingStoreUrl",
  "hasVariants",
])
export type MetaCatalogSkipReason = z.infer<typeof metaCatalogSkipReasons>

export type MetaCatalogBatchHandle =
  | {
      handle: string
      /**
       * The productId is stored alongside the retailerId Meta echoes back,
       * rather than re-derived from it later — a retailerId is often a
       * product's SKU, not its id.
       */
      items: Array<{ productId: string; retailerId: string }>
    }
  | {
      /**
       * Rollout compatibility for runs queued before productId was persisted.
       * Remove after all pre-change running rows have aged out.
       */
      handle: string
      retailerIds: string[]
    }

export type MetaCatalogItemError = {
  retailerId: string
  reason: string
}

export type MetaCatalogSkippedItem = {
  productId: string
  reason: MetaCatalogSkipReason
}
