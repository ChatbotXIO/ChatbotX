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

export const workspaceMacModel = pgTable(
  "WorkspaceMac",
  {
    ...sharedColumns,
    // Retained billing rollups stay after their workspace is purged.
    workspaceId: bigintAsString().notNull(),
    ownerId: bigintAsString().references(() => userModel.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    tenantId: bigintAsString(),
    periodStart: timestamp(periodTimestampConfig).notNull(),
    periodEnd: timestamp(periodTimestampConfig).notNull(),
    macCount: integer().notNull().default(0),
  },
  (table) => [
    index("WorkspaceMac_ownerId_periodStart_idx").on(
      table.ownerId,
      table.periodStart,
    ),
    index("WorkspaceMac_tenantId_periodStart_idx").on(
      table.tenantId,
      table.periodStart,
    ),
    unique("WorkspaceMac_workspaceId_periodStart_periodEnd_unique").on(
      table.workspaceId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
)
