import {
  bigint,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"
import { inboxModel } from "./inbox"
import { sharedColumns } from "./shared"

export const analyticsStatusEnum = pgEnum("AnalyticsStatus", [
  "processing",
  "ingested",
  "failed",
])
export const conditionOwnerType = pgEnum("ConditionOwnerType", [
  "trigger",
  "webhook",
  "broadcast",
])

export const analyticsManifestStatusModel = pgTable(
  "analytics_manifest_statuses",
  {
    objectKey: varchar("object_key", { length: 255 }).primaryKey(),
    status: analyticsStatusEnum("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    ingestedAt: timestamp("ingested_at"),
    lastError: text("last_error"),
    createdAt: sharedColumns.createdAt,
    updatedAt: sharedColumns.updatedAt,
  },
)

export const inboxContactStatsModel = pgTable("inbox_contact_stats", {
  inboxId: bigint("inbox_id", { mode: "bigint" })
    .primaryKey()
    .references(() => inboxModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  totalContacts: integer("total_contacts").notNull().default(0),
  updatedAt: sharedColumns.updatedAt,
})
