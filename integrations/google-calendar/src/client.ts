import type { Oauth2AuthValue } from "@chatbotx.io/sdk"
import { OAuth2Client } from "google-auth-library"
import { google } from "googleapis"
import type { GoogleCalendarConfig } from "./schemas"

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar"

export function getClient(props: GoogleCalendarConfig | Oauth2AuthValue) {
  const client = new OAuth2Client(
    props.clientId,
    props.clientSecret,
    props.redirectUrl,
  )

  if ("tokens" in props) {
    client.setCredentials({
      access_token: props.tokens.accessToken,
      expiry_date: props.tokens.expiresAt
        ? new Date(props.tokens.expiresAt).getTime()
        : null,
      refresh_token: props.tokens.refreshToken,
    })
  }

  return client
}

export function generateAuthUrl(props: GoogleCalendarConfig): string {
  return getClient(props).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GOOGLE_CALENDAR_SCOPE],
    state: btoa(JSON.stringify(props.stateParams)),
  })
}

export function getCalendarClient(props: Oauth2AuthValue) {
  const client = getClient(props)

  return google.calendar({ version: "v3", auth: client })
}

export async function revokeToken(auth: Oauth2AuthValue): Promise<void> {
  const client = getClient(auth)

  await client.revokeToken(auth.tokens.accessToken)
}
