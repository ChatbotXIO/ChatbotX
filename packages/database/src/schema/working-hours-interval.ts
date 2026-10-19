import { sql } from "drizzle-orm"
import { check, index, integer, pgTable } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { workingHoursModel } from "./working-hours"

export const workingHoursIntervalModel = pgTable(
  "WorkingHoursInterval",
  {
    ...sharedColumns,
    workingHoursId: bigintAsString()
      .notNull()
      .references(() => workingHoursModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** 0 = Sunday ... 6 = Saturday. */
    weekday: integer().notNull(),
    startMinute: integer().notNull(),
    /** End-exclusive; 1440 = 24:00. */
    endMinute: integer().notNull(),
  },
  (table) => [
    index("WorkingHoursInterval_workingHoursId_idx").on(table.workingHoursId),
    check(
      "WorkingHoursInterval_weekday_check",
      sql`${table.weekday} BETWEEN 0 AND 6`,
    ),
    check(
      "WorkingHoursInterval_minutes_check",
      sql`0 <= ${table.startMinute} AND ${table.startMinute} < ${table.endMinute} AND ${table.endMinute} <= 1440`,
    ),
  ],
)
