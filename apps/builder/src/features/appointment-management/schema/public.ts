import { appointmentReminderDispatchStatuses } from "@chatbotx.io/database/partials"
import {
  appointmentReminderDispatchModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { z } from "zod"
import { publicListRequest } from "@/lib/public-api/list"

// Public request/response schemas — `workspaceId` is never accepted from
// client input (it comes from the token's resolved workspace) and never
// echoed in a response; see `public-spec-operations.test.ts`'s full sweep.

// Explicit allow-list, not the whole row: every field picked here becomes a
// stable contract, so a new column added to the model does not leak until
// deliberately added here.
export const appointmentReminderDispatchPublicResource = createSelectSchema(
  appointmentReminderDispatchModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    appointmentId: z.string(),
    reminderConfigId: z.string(),
    contactInboxId: z.string().nullable(),
  },
).pick({
  id: true,
  appointmentId: true,
  reminderConfigId: true,
  contactInboxId: true,
  sendAt: true,
  status: true,
  jobId: true,
  sentAt: true,
  cancelledAt: true,
  failedReason: true,
  createdAt: true,
  updatedAt: true,
})
export type AppointmentReminderDispatchPublicResource = z.infer<
  typeof appointmentReminderDispatchPublicResource
>

export const listAppointmentRemindersPublicRequest = publicListRequest.extend({
  status: appointmentReminderDispatchStatuses.optional(),
})
