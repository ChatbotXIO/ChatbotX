import {
  type AnyPgColumn,
  index,
  integer,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

export const productCategoryModel = pgTable(
  "ProductCategory",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * Null for a top-level category, set for a sub-category. The tree is capped
     * at these two levels: a product carries one category and one sub-category,
     * so a third level would have nowhere to be stored. The depth limit lives in
     * `productCategoryService` — Postgres cannot express it on a self-reference.
     */
    parentId: bigintAsString().references(
      (): AnyPgColumn => productCategoryModel.id,
      { onDelete: "cascade", onUpdate: "cascade" },
    ),
    name: text().notNull(),
    rank: integer().default(10).notNull(),
  },
  (table) => [
    index("ProductCategory_workspaceId_idx").on(table.workspaceId),
    index("ProductCategory_parentId_idx").on(table.parentId),
    // Scoped to the parent so "Shirts" can sit under both "Men" and "Women".
    // A constraint rather than a unique index because `nullsNotDistinct` is only
    // expressible here, and it is what keeps the old guarantee for top-level
    // rows — Postgres would otherwise treat them as always-unique, their parent
    // being null.
    unique("ProductCategory_workspaceId_parent_name_key")
      .on(table.workspaceId, table.parentId, table.name)
      .nullsNotDistinct(),
  ],
)
