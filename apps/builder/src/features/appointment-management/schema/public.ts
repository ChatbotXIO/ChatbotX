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

export const appointmentReminderDispatchPublicResource = createSelectSchema(
  appointmentReminderDispatchModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    appointmentId: z.string(),
    reminderConfigId: z.string(),
    contactInboxId: z.string().nullable(),
  },
).omit({ workspaceId: true })
export type AppointmentReminderDispatchPublicResource = z.infer<
  typeof appointmentReminderDispatchPublicResource
>

export const listAppointmentRemindersPublicRequest = publicListRequest.extend({
  status: appointmentReminderDispatchStatuses.optional(),
})
