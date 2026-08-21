import {
  appointmentExternalCalendarService,
  buildContext,
} from "@chatbotx.io/business"
import {
  type GoogleCalendarAuthValue,
  type GoogleCalendarEventAttendee,
  googleCalendarAuthSchema,
  integration as integrationGoogleCalendar,
} from "@chatbotx.io/integration-google-calendar"

async function buildGoogleCalendarContext(input: {
  workspaceId: string
  integrationId: string
}) {
  const connection =
    await appointmentExternalCalendarService.getGoogleConnectionForProviderCall(
      input,
    )
  const auth = googleCalendarAuthSchema.parse(connection.auth)
  const ctx = await buildContext<GoogleCalendarAuthValue>({
    workspaceId: input.workspaceId,
    integrationType: "googleCalendar",
    integration: {
      ...connection,
      auth,
    },
  })

  return { connection, ctx }
}

export async function createGoogleCalendarEvent(input: {
  workspaceId: string
  integrationId: string
  calendarId: string
  summary: string
  description?: string
  location?: string
  startAt: string
  endAt: string
  timeZone: string
  attendees?: GoogleCalendarEventAttendee[]
}) {
  const { ctx } = await buildGoogleCalendarContext(input)
  return await integrationGoogleCalendar.runAction("createEvent", {
    ctx,
    props: {
      calendarId: input.calendarId,
      summary: input.summary,
      description: input.description,
      location: input.location,
      startAt: input.startAt,
      endAt: input.endAt,
      timeZone: input.timeZone,
      attendees: input.attendees,
    },
  })
}

export async function cancelGoogleCalendarEvent(input: {
  workspaceId: string
  integrationId: string
  calendarId: string
  eventId: string
}) {
  const { ctx } = await buildGoogleCalendarContext(input)
  await integrationGoogleCalendar.runAction("cancelEvent", {
    ctx,
    props: {
      calendarId: input.calendarId,
      eventId: input.eventId,
    },
  })
}
