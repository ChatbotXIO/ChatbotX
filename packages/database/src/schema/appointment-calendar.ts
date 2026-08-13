import { isNull } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  type AppointmentLocationType,
  type AppointmentScheduleWindowType,
  appointmentLocationTypes,
  appointmentScheduleWindowTypes,
} from "../partials/appointment"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { flowModel } from "./flow"
import { integrationModel } from "./integration-base"
import { workspaceModel } from "./workspace"

export const appointmentLocationType = pgEnum(
  "appointmentLocationType",
  appointmentLocationTypes.options as [
    AppointmentLocationType,
    ...AppointmentLocationType[],
  ],
)

export const appointmentScheduleWindowType = pgEnum(
  "appointmentScheduleWindowType",
  appointmentScheduleWindowTypes.options as [
    AppointmentScheduleWindowType,
    ...AppointmentScheduleWindowType[],
  ],
)

export const appointmentCalendarModel = pgTable(
  "AppointmentCalendar",
  {
    ...sharedColumns,
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    name: text().notNull(),
    description: text(),
    active: boolean().default(false).notNull(),
    timezone: text().notNull(),
    durationMinutes: integer().default(30).notNull(),
    bufferAfterMinutes: integer(),
    locationType: appointmentLocationType().notNull(),
    locationDetail: text(),
    scheduleWindowType: appointmentScheduleWindowType()
      .default("rollingDays")
      .notNull(),
    scheduleWindowConfig: jsonb().default({}).notNull(),
    maxAppointmentsPerUser: integer(),
    dailyLimitEnabled: boolean().default(false).notNull(),
    maxPerDay: integer(),
    allowGroupMeeting: boolean().default(false).notNull(),
    maxPerSlot: integer(),
    confirmationMessage: text(),
    confirmationFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    cancellationFlowId: bigintAsString().references(() => flowModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    externalConnectionId: bigintAsString().references(
      () => integrationModel.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    publicLinkSlug: text().notNull(),
    deletedAt: timestamp(timestampConfig),
  },
  (table) => [
    index("AppointmentCalendar_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    uniqueIndex("AppointmentCalendar_workspaceId_name_key")
      .using(
        "btree",
        table.workspaceId.asc().nullsLast(),
        table.name.asc().nullsLast(),
      )
      .where(isNull(table.deletedAt)),
    uniqueIndex("AppointmentCalendar_publicLinkSlug_key").using(
      "btree",
      table.publicLinkSlug.asc().nullsLast(),
    ),
  ],
)
