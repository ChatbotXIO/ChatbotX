import {
  type Context,
  type Handler,
  type Oauth2AuthValue,
  type Oauth2Config,
  oauth2AuthSchema,
} from "@chatbotx.io/sdk"
import { z } from "zod"

export type GoogleCalendarConfig = Oauth2Config & {
  stateParams?: {
    workspaceId: string
    referer: string
  }
}

export const googleCalendarAuthSchema = oauth2AuthSchema.extend({
  metadata: z
    .object({
      scope: z.string().optional(),
      providerCalendarId: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
})

export type GoogleCalendarAuthValue = Oauth2AuthValue & {
  metadata?: {
    scope?: string
    providerCalendarId?: string
    email?: string
  }
}

export type GoogleCalendarBusyEvent = {
  startAt: string
  endAt: string
}

export type GoogleCalendarEventAttendee = {
  email: string
}

export type GoogleCalendarActions = {
  verifyCalendar: Handler<
    {
      ctx: Context<GoogleCalendarAuthValue>
      props: { calendarId: string }
    },
    { providerCalendarId: string; email?: string }
  >
  getBusyEvents: Handler<
    {
      ctx: Context<GoogleCalendarAuthValue>
      props: {
        calendarId: string
        timeMin: string
        timeMax: string
        timeZone?: string
        timeoutMs?: number
      }
    },
    GoogleCalendarBusyEvent[]
  >
  createEvent: Handler<
    {
      ctx: Context<GoogleCalendarAuthValue>
      props: {
        calendarId: string
        summary: string
        description?: string
        location?: string
        startAt: string
        endAt: string
        timeZone: string
        attendees?: GoogleCalendarEventAttendee[]
      }
    },
    { eventId: string }
  >
  cancelEvent: Handler<
    {
      ctx: Context<GoogleCalendarAuthValue>
      props: { calendarId: string; eventId: string }
    },
    void
  >
}
