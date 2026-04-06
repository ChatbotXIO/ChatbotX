import { integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { analyticsStatuses } from "../partials/analytics"
import { sharedColumns } from "../partials/shared"

export const analyticsStatus = pgEnum(
  "analyticsStatus",
  analyticsStatuses.options as [string, ...string[]],
)

export const analyticsManifestStatusModel = pgTable("AnalyticsManifestStatus", {
  ...sharedColumns,
  status: analyticsStatus().notNull(),
  attempts: integer().notNull().default(0),
  ingestedAt: timestamp(),
  lastError: text(),
})
