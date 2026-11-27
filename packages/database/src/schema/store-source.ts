import { pgEnum } from "drizzle-orm/pg-core"
import {
  type ExternalCheckoutMethod,
  externalCheckoutMethods,
  type StoreSource,
  storeSources,
} from "../partials/ecommerce"
import {
  type ExternalStoreConnectionStatus,
  type ExternalStoreSyncStatus,
  externalStoreConnectionStatuses,
  externalStoreSyncStatuses,
} from "../partials/external-store"

/**
 * Shared by the store settings and every catalog table, so a row's source and
 * the store's source compare as one type.
 */
export const storeSource = pgEnum(
  "storeSource",
  storeSources.options as [StoreSource, ...StoreSource[]],
)

/** How an external store's web shop checks out; see `externalCheckoutMethods`. */
export const externalCheckoutMethod = pgEnum(
  "externalCheckoutMethod",
  externalCheckoutMethods.options as [
    ExternalCheckoutMethod,
    ...ExternalCheckoutMethod[],
  ],
)

/** Shared by every external store connection table. */
export const externalStoreConnectionStatus = pgEnum(
  "externalStoreConnectionStatus",
  externalStoreConnectionStatuses.options as [
    ExternalStoreConnectionStatus,
    ...ExternalStoreConnectionStatus[],
  ],
)

export const externalStoreSyncStatus = pgEnum(
  "externalStoreSyncStatus",
  externalStoreSyncStatuses.options as [
    ExternalStoreSyncStatus,
    ...ExternalStoreSyncStatus[],
  ],
)
