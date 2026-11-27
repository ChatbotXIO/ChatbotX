import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { ianaTimezoneSchema } from "@/lib/public-api/iana-timezone"

export const appointmentIdRequest = z.object({
  appointmentId: zodBigintAsString(),
})
export type AppointmentIdRequest = z.infer<typeof appointmentIdRequest>

export const createInboxBookingLinkRequest = z.object({
  calendarId: zodBigintAsString(),
  inboxId: zodBigintAsString().optional(),
  send: z.boolean(),
  bypassThreadControlLock: z.boolean().optional(),
})
export type CreateInboxBookingLinkRequest = z.infer<
  typeof createInboxBookingLinkRequest
>

export const bookContactAppointmentRequest = z.object({
  calendarId: zodBigintAsString(),
  contactId: zodBigintAsString(),
  conversationId: zodBigintAsString().optional(),
  startAt: z.iso.datetime(),
  inviteeTimezone: ianaTimezoneSchema,
})
export type BookContactAppointmentRequest = z.infer<
  typeof bookContactAppointmentRequest
>
