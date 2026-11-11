import { sql } from "drizzle-orm"
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { tenantModel } from "./enterprise/tenant"
import { templateModel } from "./template"

const cascadeFk = { onDelete: "cascade", onUpdate: "cascade" } as const
const setNullFk = { onDelete: "set null", onUpdate: "cascade" } as const

/**
 * A tab of a tenant's template store. Each white-label tenant curates its own
 * categories; nothing is shared across tenants.
 */
export const templateStoreCategoryModel = pgTable(
  "TemplateStoreCategory",
  {
    ...sharedColumns,
    tenantId: bigintAsString()
      .notNull()
      .references(() => tenantModel.id, cascadeFk),
    name: text().notNull(),
    /** Lower number = earlier tab. */
    rank: integer().default(0).notNull(),
    createdBy: bigintAsString().references(() => userModel.id, setNullFk),
  },
  (table) => [
    // Case-insensitive, so "Flows" and "flows" cannot coexist in a tenant.
    uniqueIndex("TemplateStoreCategory_tenantId_name_key").on(
      table.tenantId,
      sql`lower(${table.name})`,
    ),
    index("TemplateStoreCategory_tenantId_rank_id_idx").on(
      table.tenantId,
      table.rank,
      table.id,
    ),
    index("TemplateStoreCategory_createdBy_idx")
      .on(table.createdBy)
      .where(sql`${table.createdBy} IS NOT NULL`),
  ],
)

/** One template a tenant has approved for its public store. */
export const templateStoreListingModel = pgTable(
  "TemplateStoreListing",
  {
    ...sharedColumns,
    tenantId: bigintAsString()
      .notNull()
      .references(() => tenantModel.id, cascadeFk),
    templateId: bigintAsString()
      .notNull()
      .references(() => templateModel.id, cascadeFk),
    createdBy: bigintAsString().references(() => userModel.id, setNullFk),
  },
  (table) => [
    uniqueIndex("TemplateStoreListing_tenantId_templateId_key").on(
      table.tenantId,
      table.templateId,
    ),
    index("TemplateStoreListing_templateId_idx").on(table.templateId),
    index("TemplateStoreListing_createdBy_idx")
      .on(table.createdBy)
      .where(sql`${table.createdBy} IS NOT NULL`),
  ],
)

/** Places a listing in a category. Cards inside a tab follow the listing's approval date. */
export const templateStoreListingCategoryModel = pgTable(
  "TemplateStoreListingCategory",
  {
    listingId: bigintAsString()
      .notNull()
      .references(() => templateStoreListingModel.id, cascadeFk),
    categoryId: bigintAsString()
      .notNull()
      .references(() => templateStoreCategoryModel.id, cascadeFk),
  },
  (table) => [
    primaryKey({
      name: "TemplateStoreListingCategory_pkey",
      columns: [table.listingId, table.categoryId],
    }),
    index("TemplateStoreListingCategory_categoryId_idx").on(table.categoryId),
  ],
)
