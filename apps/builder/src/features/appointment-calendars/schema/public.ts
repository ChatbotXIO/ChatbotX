import {
  appointmentCalendarAvailabilityModel,
  appointmentCalendarReminderModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest } from "@/lib/public-api/list"
import { appointmentCalendarResource } from "./resource"

// Public request/response schemas — `workspaceId` is never accepted from
// client input (it comes from the token's resolved workspace) and never
// echoed in a response; see `public-spec-operations.test.ts`'s full sweep.

export const appointmentCalendarPublicResource =
  appointmentCalendarResource.omit({ workspaceId: true })
export type AppointmentCalendarPublicResource = z.infer<
  typeof appointmentCalendarPublicResource
>

export const listAppointmentCalendarsPublicRequest = publicListRequest.extend({
  search: z.string().optional(),
})

const appointmentCalendarAvailabilityPublicResource = createSelectSchema(
  appointmentCalendarAvailabilityModel,
  {
    id: z.string(),
    calendarId: z.string(),
  },
).omit({ calendarId: true })

const appointmentCalendarReminderPublicResource = createSelectSchema(
  appointmentCalendarReminderModel,
  {
    id: z.string(),
    calendarId: z.string(),
    flowId: z.string(),
  },
).omit({ calendarId: true })

export const appointmentCalendarForEditPublicResource =
  appointmentCalendarPublicResource.extend({
    availability: z.array(appointmentCalendarAvailabilityPublicResource),
    reminders: z.array(appointmentCalendarReminderPublicResource),
  })
export type AppointmentCalendarForEditPublicResource = z.infer<
  typeof appointmentCalendarForEditPublicResource
>

export const createAppointmentCalendarPublicResponse = z.object({
  id: z.string(),
})

export const appointmentCalendarIdPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const setAppointmentCalendarActivePublicRequest = z.object({
  active: z.boolean(),
})

export const getAppointmentCalendarAvailabilityPublicRequest = z.object({
  id: zodBigintAsString(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  contactId: zodBigintAsString().optional(),
})

export const appointmentCalendarAvailabilityPublicResponse = z.object({
  text: z.string(),
  slots: z.array(
    z.object({
      startAt: z.date(),
      endAt: z.date(),
    }),
  ),
})
