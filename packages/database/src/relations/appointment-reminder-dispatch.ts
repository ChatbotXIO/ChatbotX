import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const appointmentReminderDispatchRelations = defineRelationsPart(
  schema,
  (r) => ({
    appointmentReminderDispatchModel: {
      workspace: r.one.workspaceModel({
        from: r.appointmentReminderDispatchModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      appointment: r.one.appointmentModel({
        from: r.appointmentReminderDispatchModel.appointmentId,
        to: r.appointmentModel.id,
        optional: false,
      }),
      reminderConfig: r.one.appointmentCalendarReminderModel({
        from: r.appointmentReminderDispatchModel.reminderConfigId,
        to: r.appointmentCalendarReminderModel.id,
        optional: false,
      }),
      contactInbox: r.one.contactInboxModel({
        from: r.appointmentReminderDispatchModel.contactInboxId,
        to: r.contactInboxModel.id,
      }),
    },
  }),
)
