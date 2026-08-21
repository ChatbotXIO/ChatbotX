import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const appointmentCalendarRelations = defineRelationsPart(
  schema,
  (r) => ({
    appointmentCalendarModel: {
      workspace: r.one.workspaceModel({
        from: r.appointmentCalendarModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      confirmationFlow: r.one.flowModel({
        from: r.appointmentCalendarModel.confirmationFlowId,
        to: r.flowModel.id,
      }),
      cancellationFlow: r.one.flowModel({
        from: r.appointmentCalendarModel.cancellationFlowId,
        to: r.flowModel.id,
      }),
      externalConnection: r.one.integrationModel({
        from: r.appointmentCalendarModel.externalConnectionId,
        to: r.integrationModel.id,
      }),
      availability: r.many.appointmentCalendarAvailabilityModel({
        from: r.appointmentCalendarModel.id,
        to: r.appointmentCalendarAvailabilityModel.calendarId,
      }),
      reminders: r.many.appointmentCalendarReminderModel({
        from: r.appointmentCalendarModel.id,
        to: r.appointmentCalendarReminderModel.calendarId,
      }),
      appointments: r.many.appointmentModel({
        from: r.appointmentCalendarModel.id,
        to: r.appointmentModel.calendarId,
      }),
    },
    appointmentCalendarAvailabilityModel: {
      calendar: r.one.appointmentCalendarModel({
        from: r.appointmentCalendarAvailabilityModel.calendarId,
        to: r.appointmentCalendarModel.id,
        optional: false,
      }),
    },
    appointmentCalendarReminderModel: {
      calendar: r.one.appointmentCalendarModel({
        from: r.appointmentCalendarReminderModel.calendarId,
        to: r.appointmentCalendarModel.id,
        optional: false,
      }),
      flow: r.one.flowModel({
        from: r.appointmentCalendarReminderModel.flowId,
        to: r.flowModel.id,
        optional: false,
      }),
      dispatches: r.many.appointmentReminderDispatchModel({
        from: r.appointmentCalendarReminderModel.id,
        to: r.appointmentReminderDispatchModel.reminderConfigId,
      }),
    },
  }),
)
