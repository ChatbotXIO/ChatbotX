import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { sharedColumns, timestampConfig } from "../../partials/shared"

/**
 * The latest vendor-issued license token for this deployment. Written only by
 * the hourly refreshLicense cron; LICENSE_KEY stays the identity anchor.
 */
export const licenseModel = pgTable(
  "License",
  {
    ...sharedColumns,
    licenseId: text().notNull(),
    token: text().notNull(),
    expiresAt: timestamp(timestampConfig).notNull(),
  },
  (table) => [uniqueIndex("License_licenseId_key").on(table.licenseId)],
)
