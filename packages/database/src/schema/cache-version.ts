import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import type { CacheVersionNamespace } from "../partials/cache-version"
import { bigintAsString, timestampConfig } from "../partials/shared"

/**
 * The change counter of one cached data set within one scope (for the template
 * store: one row per tenant). Application code advances it with
 * `cacheVersionRepository.bump`, in the same transaction as each write the
 * cached data depends on. Never delete a row while its scope can still be
 * read: the version would fall back to 0 and an old cached entry could match
 * again. No foreign keys, by design.
 */
export const cacheVersionModel = pgTable(
  "CacheVersion",
  {
    namespace: text().$type<CacheVersionNamespace>().notNull(),
    scopeId: text().notNull(),
    version: bigintAsString().notNull(),
    updatedAt: timestamp(timestampConfig).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "CacheVersion_pkey",
      columns: [table.namespace, table.scopeId],
    }),
  ],
)
