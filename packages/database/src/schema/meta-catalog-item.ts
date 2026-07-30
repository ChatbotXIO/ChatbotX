import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type MetaCatalogItemDirection,
  metaCatalogItemDirections,
} from "../partials/meta-catalog"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { integrationMetaCatalogModel } from "./integration-meta-catalog"
import { productModel } from "./product"

export const metaCatalogItemDirection = pgEnum(
  "metaCatalogItemDirection",
  metaCatalogItemDirections.options as [
    MetaCatalogItemDirection,
    ...MetaCatalogItemDirection[],
  ],
)

export const metaCatalogItemModel = pgTable(
  "MetaCatalogItem",
  {
    ...sharedColumns,
    integrationMetaCatalogId: bigintAsString()
      .notNull()
      .references(() => integrationMetaCatalogModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    productId: bigintAsString()
      .notNull()
      .references(() => productModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * The catalog this link actually lives in. A connection can be rebound to a
     * different catalog at any time, so uniqueness and lookups must be scoped
     * here — a retailer ID is only unique *within* a catalog in Meta's model.
     */
    catalogId: text().notNull(),
    /** Which direction created the link, so history can show how it got here. */
    direction: metaCatalogItemDirection().default("push").notNull(),
    retailerId: text().notNull(),
    lastSyncedFingerprint: text(),
    lastSyncedAt: timestamp(timestampConfig),
  },
  (table) => [
    uniqueIndex("MetaCatalogItem_integration_retailer_key").on(
      table.integrationMetaCatalogId,
      table.catalogId,
      table.retailerId,
    ),
    uniqueIndex("MetaCatalogItem_integration_product_key").on(
      table.integrationMetaCatalogId,
      table.catalogId,
      table.productId,
    ),
    index("MetaCatalogItem_productId_idx").on(table.productId),
  ],
)
