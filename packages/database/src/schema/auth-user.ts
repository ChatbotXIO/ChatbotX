import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"

export const userModel = pgTable(
  "User",
  {
    ...sharedColumns,
    name: text(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    isAnonymous: boolean().default(false).notNull(),
    // Tenant key for white-label isolation. NULL → the platform tenant (main
    // site). When set, this row is an end-customer (sub-account) that belongs to
    // the reseller User referenced here, and lives in that reseller's tenant
    // namespace. Email is unique *within* a tenant, never across tenants.
    resellerId: bigintAsString().references((): AnyPgColumn => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  },
  (table) => [
    // Per-tenant email uniqueness: the same email may exist once on the platform
    // (resellerId IS NULL) and once per reseller tenant, all as isolated rows.
    uniqueIndex("User_email_platform_key")
      .on(table.email)
      .where(sql`${table.resellerId} IS NULL`),
    uniqueIndex("User_email_reseller_key")
      .on(table.email, table.resellerId)
      .where(sql`${table.resellerId} IS NOT NULL`),
    index("User_resellerId_idx").on(table.resellerId),
  ],
)
