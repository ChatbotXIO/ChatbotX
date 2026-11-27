import type { EncryptedData } from "@chatbotx.io/encryption"
import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../../partials/shared"
import { templateModel } from "../template"
import { tenantModel } from "./tenant"

/**
 * The template a white-label tenant installs into every workspace created
 * under it. Its own table (not `Tenant` columns) because `Template` already
 * references `Tenant`, and so the raw key never rides in the cached tenant
 * row. `keyHash` is the SHA-256 of the template's share token at the moment
 * the owner entered it: a later rotation makes the hashes differ, which stops
 * new installs instead of silently following the new secret. `encryptedKey`
 * is that same key, encrypted, so the settings page keeps showing what the
 * owner saved even after the publisher rotates it.
 */
export const tenantDefaultTemplateModel = pgTable(
  "TenantDefaultTemplate",
  {
    tenantId: bigintAsString()
      .primaryKey()
      .references(() => tenantModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    templateId: bigintAsString()
      .notNull()
      .references(() => templateModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    keyHash: text().notNull(),
    encryptedKey: jsonb().$type<EncryptedData>().notNull(),
    createdAt: timestamp(timestampConfig).defaultNow().notNull(),
    updatedAt: timestamp(timestampConfig)
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("TenantDefaultTemplate_templateId_idx").using(
      "btree",
      table.templateId.asc().nullsLast(),
    ),
  ],
)
