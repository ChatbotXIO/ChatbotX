import {
  index,
  integer,
  type PgTimestampConfig,
  pgTable,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"

const periodTimestampConfig: PgTimestampConfig<"date"> = {
  mode: "date",
  precision: 6,
  withTimezone: true,
}

/** Retained per-workspace billing evidence; it outlives Workspace. */
export const workspaceBotMessageUsageModel = pgTable(
  "WorkspaceBotMessageUsage",
  {
    ...sharedColumns,
    workspaceId: bigintAsString().notNull(),
    ownerId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    tenantId: bigintAsString().notNull(),
    periodStart: timestamp(periodTimestampConfig).notNull(),
    periodEnd: timestamp(periodTimestampConfig).notNull(),
    count: integer().notNull().default(0),
  },
  (table) => [
    index("WorkspaceBotMessageUsage_ownerId_periodStart_idx").on(
      table.ownerId,
      table.periodStart,
    ),
    index("WorkspaceBotMessageUsage_tenantId_periodStart_idx").on(
      table.tenantId,
      table.periodStart,
    ),
    unique("WorkspaceBotMessageUsage_workspaceId_periodStart_key").on(
      table.workspaceId,
      table.periodStart,
    ),
  ],
)
