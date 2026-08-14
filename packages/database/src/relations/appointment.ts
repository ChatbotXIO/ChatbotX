import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const appointmentRelations = defineRelationsPart(schema, (r) => ({
  appointmentModel: {
    workspace: r.one.workspaceModel({
      from: r.appointmentModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    calendar: r.one.appointmentCalendarModel({
      from: r.appointmentModel.calendarId,
      to: r.appointmentCalendarModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.appointmentModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    conversation: r.one.conversationModel({
      from: r.appointmentModel.conversationId,
      to: r.conversationModel.id,
    }),
    reminderDispatches: r.many.appointmentReminderDispatchModel({
      from: r.appointmentModel.id,
      to: r.appointmentReminderDispatchModel.appointmentId,
    }),
  },
}))
