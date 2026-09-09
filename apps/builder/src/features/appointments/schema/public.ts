import {
  appointmentModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest } from "@/lib/public-api/list"

// Public request/response schemas — `workspaceId` is never accepted from
// client input (it comes from the token's resolved workspace) and never
// echoed in a response; see `public-spec-operations.test.ts`'s full sweep.

const appointmentBaseResource = createSelectSchema(appointmentModel, {
  id: z.string(),
  workspaceId: z.string(),
  calendarId: z.string(),
  contactId: z.string(),
  conversationId: z.string().nullable(),
}).omit({ workspaceId: true })

// The row shape returned by `appointmentService.findByOrFail`/
// `bookAppointment`/`cancelAppointmentById`/`deleteAppointmentById` — the
// bare Appointment row.
export const appointmentPublicResource = appointmentBaseResource
export type AppointmentPublicResource = z.infer<
  typeof appointmentPublicResource
>

// The row shape returned by `appointmentService.list` — joined with calendar
// name and a pre-signed schedule URL, cancellable/deletable flags derived
// server-side.
export const appointmentListItemPublicResource = appointmentBaseResource.extend(
  {
    calendarName: z.string(),
    scheduleUrl: z.string(),
    cancellable: z.boolean(),
    deletable: z.boolean(),
  },
)
export type AppointmentListItemPublicResource = z.infer<
  typeof appointmentListItemPublicResource
>

export const appointmentListTabs = ["next", "past"] as const

export const listAppointmentsPublicRequest = publicListRequest.extend({
  calendarId: zodBigintAsString().optional(),
  tab: z.enum(appointmentListTabs).optional(),
  search: z.string().optional(),
})

export const appointmentIdPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const bookAppointmentPublicRequest = z.object({
  calendarId: zodBigintAsString(),
  contactId: zodBigintAsString(),
  conversationId: zodBigintAsString().optional().nullable(),
  startAt: z.coerce.date(),
  inviteeTimezone: z.string().optional(),
})
