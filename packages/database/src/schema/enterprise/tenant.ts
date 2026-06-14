import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../../partials/shared"
import { userModel } from "../auth-user"

// Re-exported from its definition site (`partials/shared`) so the documented
// public location stays `@chatbotx.io/database/schema`, while the eager const
// itself lives outside the tenant↔user circular import. See `shared.ts`.
export { ROOT_TENANT_ID } from "../../partials/shared"

/**
 * A `Tenant` is a white-label instance: the root tenant (id = `ROOT_TENANT_ID`,
 * `ownerId` NULL) is the platform / main site; every other tenant is a reseller's
 * branded instance, owned by the reseller `User` via `ownerId`. Identity +
 * lifecycle + branding config all live on this one row (formerly
 * `PlatformSetting`). Sub-accounts are isolated `User` rows whose `tenantId`
 * points here.
 */
export const tenantModel = pgTable(
  "Tenant",
  {
    ...sharedColumns,
    // The reseller who owns this tenant. NULL only for the seeded root tenant.
    ownerId: bigintAsString().references((): AnyPgColumn => userModel.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    // Optional stable routing/debug handle (and a future `slug.host` fallback).
    slug: text(),
    // Lifecycle flag — replaces the old `isEnabled` boolean. 'active' | 'suspended'.
    status: text().notNull().default("active"),
    disabledReason: text(),
    // Branding config (unchanged from PlatformSetting).
    brandName: text(),
    logoLightPath: text(),
    logoDarkPath: text(),
    faviconPath: text(),
    customCss: text(),
    customJs: text(),
    theme: text(),
    storageUrl: text(),
    policyUrl: text(),
    termsOfServiceUrl: text(),
    signupEmailTemplate: jsonb().$type<{ subject?: string; body?: string }>(),
    forgotPasswordEmailTemplate: jsonb().$type<{
      subject?: string
      body?: string
    }>(),
    magicLinkEmailTemplate: jsonb().$type<{
      subject?: string
      body?: string
    }>(),
  },
  (table) => [
    // One tenant per reseller (v1); the root tenant (ownerId NULL) is exempt.
    uniqueIndex("Tenant_ownerId_key")
      .on(table.ownerId)
      .where(sql`${table.ownerId} IS NOT NULL`),
    uniqueIndex("Tenant_slug_key")
      .on(table.slug)
      .where(sql`${table.slug} IS NOT NULL`),
  ],
)
