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

// Explicit allow-list, not the whole row: every field picked here becomes a
// stable contract, so a new column added to the model does not leak until
// deliberately added here. `deletedAt`/`externalSyncStatus` are internal
// bookkeeping and intentionally excluded.
const appointmentBaseResource = createSelectSchema(appointmentModel, {
  id: z.string(),
  workspaceId: z.string(),
  calendarId: z.string(),
  contactId: z.string(),
  conversationId: z.string().nullable(),
}).pick({
  id: true,
  calendarId: true,
  contactId: true,
  conversationId: true,
  startAt: true,
  endAt: true,
  inviteeTimezone: true,
  status: true,
  locationType: true,
  locationDetail: true,
  externalEventId: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
})

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
  calendarId: zodBigintAsString()
    .optional()
    .describe(
      "Restrict to appointments on this calendar. Get it from `appointmentCalendars.list`.",
    ),
  tab: z
    .enum(appointmentListTabs)
    .optional()
    .describe("Restrict to upcoming (`next`) or past appointments."),
  search: z
    .string()
    .optional()
    .describe("Case-insensitive substring match against the contact's name."),
})

export const appointmentIdPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Appointment id. Get it from `appointments.list`.",
  ),
})

export const bookAppointmentPublicRequest = z.object({
  calendarId: zodBigintAsString().describe(
    "Calendar to book on. Get it from `appointmentCalendars.list`.",
  ),
  contactId: zodBigintAsString().describe(
    "Contact id. Get it from `contacts.list`.",
  ),
  conversationId: zodBigintAsString()
    .optional()
    .nullable()
    .describe("Conversation to associate the booking with, if any."),
  startAt: z.coerce.date().describe("Slot start time."),
  inviteeTimezone: z
    .string()
    .optional()
    .describe("IANA timezone of the invitee, for display purposes."),
})
