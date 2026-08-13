import { appointmentStatuses } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const contactAppointmentResource = z.object({
  id: z.string(),
  workspaceId: z.string(),
  calendarId: z.string(),
  contactId: z.string(),
  conversationId: z.string().nullable(),
  calendarName: z.string(),
  startAt: z.date(),
  endAt: z.date(),
  inviteeTimezone: z.string(),
  status: appointmentStatuses,
})

export type ContactAppointmentResource = z.infer<
  typeof contactAppointmentResource
>
