import { z } from "zod"
import { getCalendarClient } from "../client"
import { handleError } from "../error"
import type {
  GoogleCalendarAuthValue,
  GoogleCalendarEventAttendee,
} from "../schemas"

const eventResponseSchema = z.object({
  id: z.string().min(1),
})

export async function createEvent({
  auth,
  calendarId,
  summary,
  description,
  location,
  startAt,
  endAt,
  timeZone,
  attendees,
}: {
  auth: GoogleCalendarAuthValue
  calendarId: string
  summary: string
  description?: string
  location?: string
  startAt: string
  endAt: string
  timeZone: string
  attendees?: GoogleCalendarEventAttendee[]
}): Promise<{ eventId: string }> {
  try {
    const calendarClient = getCalendarClient(auth)
    const response = await calendarClient.events.insert({
      calendarId,
      requestBody: {
        summary,
        description,
        location,
        start: { dateTime: startAt, timeZone },
        end: { dateTime: endAt, timeZone },
        attendees,
      },
    })
    const parsed = eventResponseSchema.parse(response.data)

    return { eventId: parsed.id }
  } catch (error) {
    return handleError(error, "createEvent")
  }
}

export async function cancelEvent({
  auth,
  calendarId,
  eventId,
}: {
  auth: GoogleCalendarAuthValue
  calendarId: string
  eventId: string
}): Promise<void> {
  try {
    const calendarClient = getCalendarClient(auth)
    await calendarClient.events.delete({ calendarId, eventId })
  } catch (error) {
    return handleError(error, "cancelEvent")
  }
}
