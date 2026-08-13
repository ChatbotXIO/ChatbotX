import {
  AuthException,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { getBusyEvents } from "./apis/busy-events"
import { verifyCalendarAccess } from "./apis/calendars"
import { cancelEvent, createEvent } from "./apis/events"
import { generateAuthUrl, getClient, revokeToken } from "./client"
import { handleError } from "./error"
import { callbackHandler } from "./handlers/callback"
import type {
  GoogleCalendarActions,
  GoogleCalendarAuthValue,
  GoogleCalendarConfig,
} from "./schemas"

const config: IntegrationDefinition<
  GoogleCalendarConfig,
  GoogleCalendarAuthValue,
  GoogleCalendarActions
> = {
  name: "googleCalendar",
  actions: {
    verifyCalendar: async ({ ctx, props }) =>
      await verifyCalendarAccess(ctx.auth, props.calendarId),
    getBusyEvents: async ({ ctx, props }) =>
      await getBusyEvents({
        auth: ctx.auth,
        calendarId: props.calendarId,
        timeMin: props.timeMin,
        timeMax: props.timeMax,
        timeZone: props.timeZone,
        timeoutMs: props.timeoutMs,
      }),
    createEvent: async ({ ctx, props }) =>
      await createEvent({
        auth: ctx.auth,
        calendarId: props.calendarId,
        summary: props.summary,
        description: props.description,
        location: props.location,
        startAt: props.startAt,
        endAt: props.endAt,
        timeZone: props.timeZone,
        attendees: props.attendees,
      }),
    cancelEvent: async ({ ctx, props }) =>
      await cancelEvent({
        auth: ctx.auth,
        calendarId: props.calendarId,
        eventId: props.eventId,
      }),
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const method = segments.pop()

    switch (method) {
      case HandleRequestType.callback:
        return await callbackHandler(props)
      case HandleRequestType.generateAuthUrl:
        return generateAuthUrl(props.config)
      default:
        throw new SdkException(
          `Handler: ${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: async (auth): Promise<void> => {
    await revokeToken(auth)
  },
  refreshAuth: async ({ auth }) => {
    if (!auth.tokens.refreshToken) {
      throw new AuthException("Google Calendar refresh token not available")
    }

    try {
      const client = getClient(auth)
      const { credentials } = await client.refreshAccessToken()
      if (!credentials.access_token) {
        throw new AuthException("Google Calendar refresh returned no token")
      }

      return {
        ...auth,
        tokens: {
          ...auth.tokens,
          accessToken: credentials.access_token,
          refreshToken:
            credentials.refresh_token ?? auth.tokens.refreshToken ?? null,
          expiresAt: credentials.expiry_date
            ? new Date(credentials.expiry_date).toISOString()
            : auth.tokens.expiresAt,
        },
      }
    } catch (error) {
      return handleError(error, "refreshAuth")
    }
  },
}

export const integration = new Integration(config)
