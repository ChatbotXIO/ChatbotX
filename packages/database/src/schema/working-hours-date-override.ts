import { sql } from "drizzle-orm"
import {
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import type { WorkingHoursDateRanges } from "../partials/working-hours"
import { workingHoursModel } from "./working-hours"
import { workspaceModel } from "./workspace"

/**
 * One row per calendar date that differs from the weekly schedule. A NULL
 * `workingHoursId` is a workspace-wide holiday; otherwise it overrides that one
 * schedule. `ranges` is the day's complete list of open ranges (`[]` = closed
 * all day) and has no database default — every insert writes it explicitly.
 */
export const workingHoursDateOverrideModel = pgTable(
  "WorkingHoursDateOverride",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workingHoursId: bigintAsString(),
    date: date({ mode: "string" }).notNull(),
    name: text(),
    ranges: jsonb().$type<WorkingHoursDateRanges>().notNull(),
  },
  (table) => [
    // MATCH SIMPLE: skipped while `workingHoursId` is NULL (workspace holiday).
    foreignKey({
      name: "WorkingHoursDateOverride_workingHoursId_workspaceId_fkey",
      columns: [table.workingHoursId, table.workspaceId],
      foreignColumns: [workingHoursModel.id, workingHoursModel.workspaceId],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("WorkingHoursDateOverride_workspace_date_key")
      .on(table.workspaceId, table.date)
      .where(sql`${table.workingHoursId} IS NULL`),
    uniqueIndex("WorkingHoursDateOverride_schedule_date_key")
      .on(table.workingHoursId, table.date)
      .where(sql`${table.workingHoursId} IS NOT NULL`),
    index("WorkingHoursDateOverride_workspaceId_date_idx").on(
      table.workspaceId,
      table.date,
    ),
  ],
)
