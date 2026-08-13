import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type AppointmentReminderDispatchStatus,
  appointmentReminderDispatchStatuses,
} from "../partials/appointment"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { appointmentModel } from "./appointment"
import { appointmentCalendarReminderModel } from "./appointment-calendar-reminder"
import { contactInboxModel } from "./contact-inbox"
import { workspaceModel } from "./workspace"

export const appointmentReminderDispatchStatus = pgEnum(
  "appointmentReminderDispatchStatus",
  appointmentReminderDispatchStatuses.options as [
    AppointmentReminderDispatchStatus,
    ...AppointmentReminderDispatchStatus[],
  ],
)

export const appointmentReminderDispatchModel = pgTable(
  "AppointmentReminderDispatch",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    appointmentId: bigintAsString()
      .notNull()
      .references(() => appointmentModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    reminderConfigId: bigintAsString()
      .notNull()
      .references(() => appointmentCalendarReminderModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactInboxId: bigintAsString().references(() => contactInboxModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    sendAt: timestamp(timestampConfig).notNull(),
    status: appointmentReminderDispatchStatus().default("pending").notNull(),
    jobId: text().notNull(),
    sentAt: timestamp(timestampConfig),
    cancelledAt: timestamp(timestampConfig),
    failedReason: text(),
  },
  (table) => [
    uniqueIndex("AppointmentReminderDispatch_jobId_key").using(
      "btree",
      table.jobId.asc().nullsLast(),
    ),
    index("AppointmentReminderDispatch_status_sendAt_idx").using(
      "btree",
      table.status.asc().nullsLast(),
      table.sendAt.asc().nullsLast(),
    ),
    index("AppointmentReminderDispatch_appointmentId_idx").using(
      "btree",
      table.appointmentId.asc().nullsLast(),
    ),
    index("AppointmentReminderDispatch_contactInboxId_idx").using(
      "btree",
      table.contactInboxId.asc().nullsLast(),
    ),
  ],
)
