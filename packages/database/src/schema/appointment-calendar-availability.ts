import { index, integer, pgTable } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { appointmentCalendarModel } from "./appointment-calendar"

export const appointmentCalendarAvailabilityModel = pgTable(
  "AppointmentCalendarAvailability",
  {
    ...sharedColumns,
    calendarId: bigintAsString()
      .notNull()
      .references(() => appointmentCalendarModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    weekday: integer().notNull(),
    startMinute: integer().notNull(),
    endMinute: integer().notNull(),
  },
  (table) => [
    index("AppointmentCalendarAvailability_calendarId_idx").using(
      "btree",
      table.calendarId.asc().nullsLast(),
    ),
  ],
)
