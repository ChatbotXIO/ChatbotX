import { sql } from "drizzle-orm"
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type MetaCatalogBatchHandle,
  type MetaCatalogItemError,
  type MetaCatalogSkippedItem,
  type MetaCatalogSyncScope,
  type MetaCatalogSyncStatus,
  metaCatalogSyncScopes,
  metaCatalogSyncStatuses,
} from "../partials/meta-catalog"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { integrationMetaCatalogModel } from "./integration-meta-catalog"
import { metaCatalogItemDirection } from "./meta-catalog-item"
import { productCategoryModel } from "./product-category"
import { workspaceModel } from "./workspace"

export const metaCatalogSyncStatus = pgEnum(
  "metaCatalogSyncStatus",
  metaCatalogSyncStatuses.options as [
    MetaCatalogSyncStatus,
    ...MetaCatalogSyncStatus[],
  ],
)
export const metaCatalogSyncScope = pgEnum(
  "metaCatalogSyncScope",
  metaCatalogSyncScopes.options as [
    MetaCatalogSyncScope,
    ...MetaCatalogSyncScope[],
  ],
)

export const metaCatalogSyncRunModel = pgTable(
  "MetaCatalogSyncRun",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    integrationMetaCatalogId: bigintAsString()
      .notNull()
      .references(() => integrationMetaCatalogModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    status: metaCatalogSyncStatus().default("queued").notNull(),
    /**
     * Which way the products moved. Both directions are recorded here so the
     * workspace has one history to read instead of a push log plus a set of
     * counters on the connection that every import overwrites.
     *
     * Shares the enum type with `MetaCatalogItem.direction` — it is the same
     * push/import vocabulary, and a link's direction should never be able to
     * name something a run cannot.
     */
    direction: metaCatalogItemDirection().default("push").notNull(),
    /**
     * The catalog this run actually targeted, snapshotted rather than read back
     * from the connection: a sync can rebind the connection to another catalog,
     * so the current binding does not describe older runs. Nullable because runs
     * recorded before this column existed have no answer.
     */
    catalogId: text(),
    scope: metaCatalogSyncScope().default("all").notNull(),
    categoryId: bigintAsString().references(() => productCategoryModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    selectedProductIds: jsonb().$type<string[]>().default([]).notNull(),
    handles: jsonb().$type<MetaCatalogBatchHandle[]>().default([]).notNull(),
    /**
     * Ownership token for the submit phase. A stalled BullMQ delivery can
     * overlap its recovery; only the current lease may checkpoint or release.
     */
    submissionLeaseId: text(),
    totalCount: integer().default(0).notNull(),
    succeededCount: integer().default(0).notNull(),
    failedCount: integer().default(0).notNull(),
    skippedCount: integer().default(0).notNull(),
    itemErrors: jsonb().$type<MetaCatalogItemError[]>().default([]).notNull(),
    skippedItems: jsonb()
      .$type<MetaCatalogSkippedItem[]>()
      .default([])
      .notNull(),
    pollAttempt: integer().default(0).notNull(),
    error: text(),
    startedAt: timestamp(timestampConfig),
    finishedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("MetaCatalogSyncRun_active_idx")
      .on(table.workspaceId)
      .where(sql`${table.status} IN ('queued', 'running')`),
  ],
)
