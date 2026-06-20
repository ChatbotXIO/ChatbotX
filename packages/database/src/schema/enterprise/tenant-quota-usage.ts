import { integer, pgTable, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../../partials/shared"
import { tenantModel } from "./tenant"

/**
 * Aggregate (pooled) usage counters for a white-label tenant (reseller). A
 * reseller's plan limits live on the tenant owner's `UserQuota` row (written by
 * the enterprise billing layer); this table only tracks the *summed* usage of
 * every customer under the tenant. The dual-level enforcement compares this
 * pooled usage against the owner's limit. The root tenant has no pool — pooling
 * applies only to reseller tenants (`ownerId` not NULL).
 */
export const tenantQuotaUsageModel = pgTable("TenantQuotaUsage", {
  ...sharedColumns,
  tenantId: bigintAsString()
    .notNull()
    .unique()
    .references(() => tenantModel.id, { onDelete: "cascade" }),
  contactsUsed: integer().notNull().default(0),
  workspacesUsed: integer().notNull().default(0),
  channelsUsed: integer().notNull().default(0),
  teamMembersUsed: integer().notNull().default(0),
  macUsed: integer().notNull().default(0),
  syncedAt: timestamp(timestampConfig).notNull().defaultNow(),
})
