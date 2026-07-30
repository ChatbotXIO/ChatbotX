type MetaCatalogImportStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"

type MetaCatalogSkipReason =
  | "missingImage"
  | "missingDescription"
  | "missingStoreUrl"
  | "hasVariants"

export type MetaCatalogConnection = {
  id: string
  catalogId: string | null
  catalogName: string | null
  businessId: string | null
  authMode: "oauth" | "fbe"
  currency: string
  storeUrl: string | null
  status: "active" | "invalid"
  importStatus: MetaCatalogImportStatus
  importTotalCount: number
  importedCount: number
  importFailedCount: number
  importError: string | null
  tokenExpiresAt: Date | string | null
  lastImportedAt: Date | string | null
}

export type MetaCatalogSyncRun = {
  id: string
  status: "queued" | "running" | "succeeded" | "partial" | "failed"
  /** Which way the products moved. Both directions share one history list. */
  direction: "push" | "import"
  /** Null for runs recorded before the catalog was stored on the run itself. */
  catalogId: string | null
  totalCount: number
  succeededCount: number
  failedCount: number
  skippedCount: number
  error: string | null
  itemErrors: Array<{ retailerId: string; reason: string }>
  skippedItems: Array<{
    productId: string
    /** Undefined when the product has since been deleted. */
    productName?: string
    reason: MetaCatalogSkipReason
  }>
  createdAt: Date | string
}

export type MetaCatalogViewState = {
  connection: MetaCatalogConnection | null
  history: MetaCatalogSyncRun[]
}

export type MetaCatalogSyncScope = "all" | "category" | "selected"

/** A run is still in flight while it sits in the queue or executes. */
export const ACTIVE_SYNC_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
])
