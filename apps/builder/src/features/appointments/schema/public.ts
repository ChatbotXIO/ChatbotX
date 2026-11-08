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

export const bookAppointmentPublicRequest = z
  .object({
    calendarId: zodBigintAsString().describe(
      "Calendar to book on. Get it from `appointmentCalendars.list`.",
    ),
    contactId: zodBigintAsString().describe(
      "Contact id. Get it from `contacts.list`.",
    ),
    conversationId: zodBigintAsString()
      .optional()
      .nullable()
      .describe(
        "Conversation of this contact to associate the booking with, if any.",
      ),
    inboxId: zodBigintAsString()
      .optional()
      .describe(
        "Channel inbox of the conversation. When set together with conversationId, the calendar's confirmation flow is sent to the contact on this inbox and reminders use it. Omit to book silently (previous behaviour).",
      ),
    startAt: z.coerce.date().describe("Slot start time."),
    // Kept as a plain string: this route is released, and clients may already
    // send non-IANA values (`GMT+7`). `bookAppointment` falls back to the
    // calendar timezone for a value it cannot format with.
    inviteeTimezone: z
      .string()
      .optional()
      .describe(
        "IANA timezone of the invitee (e.g. `Asia/Ho_Chi_Minh`), for display purposes. An unrecognised value falls back to the calendar's timezone.",
      ),
  })
  .superRefine((value, ctx) => {
    if (value.inboxId && !value.conversationId) {
      ctx.addIssue({
        code: "custom",
        path: ["inboxId"],
        message: "inboxId requires conversationId",
      })
    }
  })

export const createBookingLinkPublicRequest = z.object({
  conversationId: zodBigintAsString().describe(
    "Conversation whose contact the link books for. Get it from `conversations.list`.",
  ),
  calendarId: zodBigintAsString().describe(
    "Calendar to book on. Get it from `appointmentCalendars.list`; it must be active.",
  ),
  inboxId: zodBigintAsString()
    .optional()
    .describe(
      "Channel inbox of the conversation to book and send on. Defaults to the contact's most recent inbox.",
    ),
  send: z
    .boolean()
    .default(false)
    .describe(
      "When true, also sends the link on the conversation as a message with a booking button (requires the `inbox` token scope).",
    ),
  bypassThreadControlLock: z
    .boolean()
    .optional()
    .describe(
      "With send=true: skip the WhatsApp thread-control standby lock for this message.",
    ),
})

export const createBookingLinkPublicResponse = z.object({
  url: z.url().describe("Booking picker URL for the contact."),
  expiresAt: z.date().describe("When the link stops working (24 hours)."),
  calendar: z.object({ id: z.string(), name: z.string() }),
  messageId: z
    .string()
    .nullable()
    .describe("Id of the sent message when send=true, otherwise null."),
})
