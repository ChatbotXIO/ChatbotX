import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { UserConnectionAuthorizations } from "../partials/connection"
import {
  bigintAsString,
  ROOT_TENANT_ID,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { tenantModel } from "./enterprise/tenant"

export const userModel = pgTable(
  "User",
  {
    ...sharedColumns,
    name: text(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    isAnonymous: boolean().default(false).notNull(),
    mustChangePassword: boolean().default(false).notNull(),
    deletionRequestedAt: timestamp(timestampConfig),
    scheduledDeletionAt: timestamp(timestampConfig),
    // Backup of the user's latest provider authorization (one encrypted entry
    // per provider), kept independently of Connection/channel rows. Nullable,
    // no default: existing rows need no rewrite.
    connectionAuthorizations: jsonb().$type<UserConnectionAuthorizations>(),
    // Tenant key for white-label isolation. Defaults to the root tenant (the
    // platform / main site). When it points at a reseller's `Tenant`, this row
    // is an end-customer (sub-account) isolated inside that tenant. Email is
    // unique *within* a tenant, never across tenants.
    tenantId: bigintAsString()
      .notNull()
      .default(ROOT_TENANT_ID)
      .references((): AnyPgColumn => tenantModel.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    // Per-tenant email uniqueness: the same email may exist once per tenant
    // (platform or any reseller), all as fully isolated rows.
    uniqueIndex("User_email_tenant_key").on(table.email, table.tenantId),
    index("User_tenantId_idx").on(table.tenantId),
    index("User_scheduledDeletionAt_idx")
      .on(table.scheduledDeletionAt)
      .where(sql`${table.scheduledDeletionAt} IS NOT NULL`),
  ],
)
