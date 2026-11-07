import { pgEnum } from "drizzle-orm/pg-core"
import { type StoreSource, storeSources } from "../partials/ecommerce"

/**
 * Shared by the store settings and every catalog table, so a row's source and
 * the store's source compare as one type.
 */
export const storeSource = pgEnum(
  "storeSource",
  storeSources.options as [StoreSource, ...StoreSource[]],
)
