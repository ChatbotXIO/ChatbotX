import { z } from "zod"
import { getCalendarClient } from "../client"
import { handleError } from "../error"
import type {
  GoogleCalendarAuthValue,
  GoogleCalendarBusyEvent,
} from "../schemas"

const freeBusyResponseSchema = z.object({
  calendars: z.record(
    z.string(),
    z.object({
      busy: z
        .array(
          z.object({
            start: z.string(),
            end: z.string(),
          }),
        )
        .optional(),
    }),
  ),
})

export async function getBusyEvents({
  auth,
  calendarId,
  timeMin,
  timeMax,
  timeZone,
  timeoutMs,
}: {
  auth: GoogleCalendarAuthValue
  calendarId: string
  timeMin: string
  timeMax: string
  timeZone?: string
  timeoutMs?: number
}): Promise<GoogleCalendarBusyEvent[]> {
  try {
    const calendarClient = getCalendarClient(auth)
    const response = await calendarClient.freebusy.query(
      {
        requestBody: {
          timeMin,
          timeMax,
          timeZone,
          items: [{ id: calendarId }],
        },
      },
      timeoutMs ? { timeout: timeoutMs } : undefined,
    )
    const parsed = freeBusyResponseSchema.parse(response.data)
    const busy = parsed.calendars[calendarId]?.busy ?? []

    return busy.map((event) => ({
      startAt: event.start,
      endAt: event.end,
    }))
  } catch (error) {
    return handleError(error, "getBusyEvents")
  }
}
