import { z } from "zod"
import { getCalendarClient } from "../client"
import { getGaxiosStatus, handleError } from "../error"
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
  eventId,
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
  eventId: string
}): Promise<{ eventId: string }> {
  try {
    const calendarClient = getCalendarClient(auth)
    const response = await calendarClient.events.insert(
      {
        calendarId,
        sendUpdates: "all",
        requestBody: {
          id: eventId,
          summary,
          description,
          location,
          start: { dateTime: startAt, timeZone },
          end: { dateTime: endAt, timeZone },
          attendees,
        },
      },
      { timeout: 60_000 },
    )
    const parsed = eventResponseSchema.parse(response.data)

    return { eventId: parsed.id }
  } catch (error) {
    if (getGaxiosStatus(error) === 409) {
      try {
        const calendarClient = getCalendarClient(auth)
        const response = await calendarClient.events.get(
          { calendarId, eventId },
          { timeout: 60_000 },
        )
        const parsed = eventResponseSchema.parse(response.data)
        return { eventId: parsed.id }
      } catch (lookupError) {
        return handleError(lookupError, "getEventAfterCreateConflict")
      }
    }
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
    await calendarClient.events.delete(
      { calendarId, eventId, sendUpdates: "all" },
      { timeout: 60_000 },
    )
  } catch (error) {
    const status = getGaxiosStatus(error)
    if (status === 404 || status === 410) {
      return
    }
    return handleError(error, "cancelEvent")
  }
}
