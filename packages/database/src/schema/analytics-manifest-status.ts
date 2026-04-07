import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { analyticsStatuses } from "../partials/analytics"

export const analyticsStatus = pgEnum(
  "analyticsStatus",
  analyticsStatuses.options as [string, ...string[]],
)

export const analyticsManifestStatusModel = pgTable(
  "AnalyticsManifestStatus",
  {
    objectKey: text().notNull(),
    status: analyticsStatus().notNull(),
    attempts: integer().notNull().default(0),
    ingestedAt: timestamp(),
    lastError: text(),
  },
  (table) => [
    uniqueIndex("AnalyticsManifestStatus_objectKey_key").using(
      "btree",
      table.objectKey.asc().nullsLast(),
    ),
  ],
)
