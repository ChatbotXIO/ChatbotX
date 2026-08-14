import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import {
  type AppointmentExternalSyncStatus,
  type AppointmentLocationType,
  type AppointmentStatus,
  appointmentExternalSyncStatuses,
  appointmentLocationTypes,
  appointmentStatuses,
} from "../partials/appointment"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { appointmentCalendarModel } from "./appointment-calendar"
import { contactModel } from "./contact"
import { conversationModel } from "./conversation"
import { workspaceModel } from "./workspace"

export const appointmentStatus = pgEnum(
  "appointmentStatus",
  appointmentStatuses.options as [AppointmentStatus, ...AppointmentStatus[]],
)

export const appointmentExternalSyncStatus = pgEnum(
  "appointmentExternalSyncStatus",
  appointmentExternalSyncStatuses.options as [
    AppointmentExternalSyncStatus,
    ...AppointmentExternalSyncStatus[],
  ],
)

export const appointmentLocationTypeSnapshot = pgEnum(
  "appointmentLocationTypeSnapshot",
  appointmentLocationTypes.options as [
    AppointmentLocationType,
    ...AppointmentLocationType[],
  ],
)

export const appointmentModel = pgTable(
  "Appointment",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    calendarId: bigintAsString()
      .notNull()
      .references(() => appointmentCalendarModel.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    conversationId: bigintAsString().references(() => conversationModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    startAt: timestamp(timestampConfig).notNull(),
    endAt: timestamp(timestampConfig).notNull(),
    inviteeTimezone: text().notNull(),
    status: appointmentStatus().default("scheduled").notNull(),
    locationType: appointmentLocationTypeSnapshot().notNull(),
    locationDetail: text(),
    externalEventId: text(),
    externalSyncStatus: appointmentExternalSyncStatus(),
    cancelledAt: timestamp(timestampConfig),
    deletedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("Appointment_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("Appointment_workspaceId_startAt_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.startAt.asc().nullsLast(),
    ),
    index("Appointment_calendarId_status_startAt_idx").using(
      "btree",
      table.calendarId.asc().nullsLast(),
      table.status.asc().nullsLast(),
      table.startAt.asc().nullsLast(),
    ),
    index("Appointment_contactId_calendarId_status_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
      table.calendarId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
  ],
)
