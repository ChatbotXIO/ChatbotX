import {
  integer,
  type PgTimestampConfig,
  pgTable,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workspaceModel } from "./workspace"

const periodTimestampConfig: PgTimestampConfig<"date"> = {
  mode: "date",
  precision: 6,
  withTimezone: true,
}

export const workspaceMacModel = pgTable(
  "WorkspaceMac",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    periodStart: timestamp(periodTimestampConfig).notNull(),
    periodEnd: timestamp(periodTimestampConfig).notNull(),
    macCount: integer().notNull().default(0),
  },
  (table) => [
    unique("WorkspaceMac_workspaceId_periodStart_periodEnd_unique").on(
      table.workspaceId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
)
