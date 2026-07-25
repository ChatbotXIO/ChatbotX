import { integer, pgTable, timestamp } from "drizzle-orm/pg-core"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../../partials/shared"
import { workspaceModel } from "../workspace"

/**
 * Display-only per-workspace contribution to the owner's quota pool. Limits
 * and enforcement remain exclusively on UserQuota.
 */
export const workspaceUsageModel = pgTable("WorkspaceUsage", {
  ...sharedColumns,
  workspaceId: bigintAsString()
    .notNull()
    .unique()
    .references(() => workspaceModel.id, { onDelete: "cascade" }),
  contactsUsed: integer().notNull().default(0),
  channelsUsed: integer().notNull().default(0),
  teamMembersUsed: integer().notNull().default(0),
  botMessagesUsed: integer().notNull().default(0),
  macUsed: integer().notNull().default(0),
  syncedAt: timestamp(timestampConfig).notNull().defaultNow(),
})
