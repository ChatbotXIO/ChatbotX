import { integer, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core"
import {
  type AppointmentReminderTimingUnit,
  appointmentReminderTimingUnits,
} from "../partials/appointment"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { appointmentCalendarModel } from "./appointment-calendar"
import { flowModel } from "./flow"

export const appointmentReminderTimingUnit = pgEnum(
  "appointmentReminderTimingUnit",
  appointmentReminderTimingUnits.options as [
    AppointmentReminderTimingUnit,
    ...AppointmentReminderTimingUnit[],
  ],
)

export const appointmentCalendarReminderModel = pgTable(
  "AppointmentCalendarReminder",
  {
    ...sharedColumns,
    calendarId: bigintAsString()
      .notNull()
      .references(() => appointmentCalendarModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigintAsString()
      .notNull()
      .references(() => flowModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    timingValue: integer().notNull(),
    timingUnit: appointmentReminderTimingUnit().notNull(),
  },
  (table) => [
    uniqueIndex("AppointmentCalendarReminder_dedupe_key").using(
      "btree",
      table.calendarId.asc().nullsLast(),
      table.flowId.asc().nullsLast(),
      table.timingValue.asc().nullsLast(),
      table.timingUnit.asc().nullsLast(),
    ),
  ],
)
